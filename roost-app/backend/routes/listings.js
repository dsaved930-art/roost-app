const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { notifySavedSearches } = require('../services/alerts');
const { sendNewMessageEmail } = require('../utils/messageNotify');
const { containsUrl } = require('../utils/linkDetection');
const { publicDisplayName } = require('../utils/displayName');
const { geocodeCityState } = require('../utils/geocode');
const { stripe, stripeConfigured } = require('../utils/stripe');

// v1 is deliberately a single flat tier — simplest thing to actually test
// whether sellers want this at all before building out multiple durations.
const BOOST_PRICE_CENTS = 499; // $4.99
const BOOST_DURATION_DAYS = 3;

// Browse — summaries only. Contact info is never included here, at all, for anyone.
// Sold listings are excluded here so buyers don't wade through unavailable
// birds — they still exist and are visible via GET /sold and their own detail page.
router.get('/', async (req, res) => {
  try {
    // req.user comes from authOptional (set on every request, even here where
    // sign-in isn't required) — null when signed out, which makes the saved-
    // listings join below correctly match nothing rather than erroring.
    const result = await pool.query(
      `SELECT l.id, l.title, l.category, l.breed, l.age, l.sex, l.free, l.price, l.price_type AS "priceType", l.open_to_trade AS "openToTrade", l.city, l.state,
              l.photo_thumb AS "photoUrl", l.created_at AS "createdAt", l.lat, l.lon,
              l.status, l.shipping_available AS "shippingAvailable", l.condition,
              COALESCE(u.verification_status = 'verified', FALSE) AS "sellerVerified",
              (sl.id IS NOT NULL) AS "savedByMe",
              (l.boosted_until IS NOT NULL AND l.boosted_until > now()) AS "isBoosted"
       FROM listings l
       LEFT JOIN users u ON u.id = l.posted_by
       LEFT JOIN saved_listings sl ON sl.listing_id = l.id AND sl.user_id = $1
       WHERE l.status != 'sold'
       ORDER BY (l.boosted_until IS NOT NULL AND l.boosted_until > now()) DESC, l.created_at DESC`,
      [req.user ? req.user.id : null]
    );
    res.json({ listings: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load listings.' });
  }
});

// Recently sold — public social proof that the platform actually produces
// sales. Must be registered before GET /:id, same reason as /mine below.
router.get('/sold', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, category, free, price, price_type AS "priceType", city, state, photo_thumb AS "photoUrl", sold_at AS "soldAt"
       FROM listings
       WHERE status = 'sold'
       ORDER BY sold_at DESC
       LIMIT 12`
    );
    res.json({ listings: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load recently sold listings.' });
  }
});

// Seller-facing analytics: every listing this user has posted, with real
// usage numbers attached — this is what makes the difference between
// "I posted a bird and heard nothing" and "I can see 40 people looked at this
// and 3 messaged me." Must be registered before GET /:id, or Express would
// try to treat "mine" as an :id value.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.title, l.category, l.free, l.price, l.price_type AS "priceType", l.city, l.state, l.status, l.sold_at AS "soldAt",
              l.photo_thumb AS "photoUrl", l.created_at AS "createdAt", l.view_count AS "viewCount",
              l.boosted_until AS "boostedUntil", l.boost_started_at AS "boostStartedAt",
              l.boost_view_count_at_start AS "boostViewCountAtStart",
              l.boost_save_count_at_start AS "boostSaveCountAtStart",
              l.boost_conversation_count_at_start AS "boostConversationCountAtStart",
              (SELECT COUNT(DISTINCT buyer_id)::int FROM conversations WHERE listing_id = l.id) AS "conversationCount",
              (SELECT COUNT(*)::int FROM saved_search_matches WHERE listing_id = l.id) AS "alertMatches",
              (SELECT COUNT(*)::int FROM saved_listings WHERE listing_id = l.id) AS "saveCount"
       FROM listings l
       WHERE l.posted_by = $1
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    // "Gained since boosting" as a real before/after delta, not a lifetime
    // total — computed here so the frontend just displays a number.
    const listings = result.rows.map(l => {
      if (!l.boostStartedAt) return { ...l, boostIsActive: false };
      return {
        ...l,
        boostIsActive: !!(l.boostedUntil && new Date(l.boostedUntil) > new Date()),
        boostViewsGained: Math.max(0, l.viewCount - (l.boostViewCountAtStart || 0)),
        boostSavesGained: Math.max(0, l.saveCount - (l.boostSaveCountAtStart || 0)),
        boostConversationsGained: Math.max(0, l.conversationCount - (l.boostConversationCountAtStart || 0))
      };
    });
    res.json({ listings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your listings.' });
  }
});

// Listings this user has bookmarked for later. Must be registered before
// GET /:id, same reason as /mine and /sold above.
router.get('/saved', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.title, l.category, l.breed, l.age, l.sex, l.free, l.price, l.price_type AS "priceType",
              l.open_to_trade AS "openToTrade", l.city, l.state, l.photo_thumb AS "photoUrl",
              l.created_at AS "createdAt", l.status, l.condition, sl.created_at AS "savedAt", TRUE AS "savedByMe"
       FROM saved_listings sl
       JOIN listings l ON l.id = sl.listing_id
       WHERE sl.user_id = $1
       ORDER BY sl.created_at DESC`,
      [req.user.id]
    );
    res.json({ listings: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your saved listings.' });
  }
});

router.post('/:id/save', requireAuth, async (req, res) => {
  try {
    const listingCheck = await pool.query('SELECT id FROM listings WHERE id = $1', [req.params.id]);
    if (listingCheck.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    await pool.query(
      'INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2) ON CONFLICT (user_id, listing_id) DO NOTHING',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save that listing.' });
  }
});

router.delete('/:id/save', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2', [req.user.id, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not unsave that listing.' });
  }
});

// Starts a Stripe Checkout session to boost this listing. Confirmation (and
// actually activating the boost) happens in /boost/confirm once Stripe
// redirects back — this route only ever creates the session, it never
// touches boosted_until itself.
router.post('/:id/boost/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripeConfigured) return res.status(503).json({ error: 'Payments are not configured yet.' });

    const listingResult = await pool.query(
      'SELECT id, title, posted_by, status, boosted_until AS "boostedUntil" FROM listings WHERE id = $1',
      [req.params.id]
    );
    if (listingResult.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    const listing = listingResult.rows[0];
    if (listing.posted_by !== req.user.id) return res.status(403).json({ error: 'You can only boost your own listings.' });
    if (listing.status === 'sold') return res.status(400).json({ error: "Sold listings can't be boosted." });
    if (listing.boostedUntil && new Date(listing.boostedUntil) > new Date()) {
      return res.status(400).json({ error: `This listing is already boosted until ${new Date(listing.boostedUntil).toLocaleString()}.` });
    }

    const base = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: BOOST_PRICE_CENTS,
          product_data: {
            name: `Boost listing: ${listing.title}`,
            description: `${BOOST_DURATION_DAYS} days of top placement on Roost`
          }
        },
        quantity: 1
      }],
      success_url: `${base}/?boostConfirm=${listing.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?boostCanceled=${listing.id}`,
      metadata: { listingId: String(listing.id), userId: String(req.user.id) }
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not start checkout for that boost.' });
  }
});

// Confirms a completed Checkout session and actually activates the boost.
// Keyed off session id (not just "did a payment happen") so a page refresh
// or double-click can't re-snapshot the view/save/message counts a second
// time and wipe out an in-progress "gained since boosting" delta.
router.post('/:id/boost/confirm', requireAuth, async (req, res) => {
  try {
    if (!stripeConfigured) return res.status(503).json({ error: 'Payments are not configured yet.' });
    const sessionId = String((req.body && req.body.sessionId) || '');
    if (!sessionId) return res.status(400).json({ error: 'Missing checkout session.' });

    const listingResult = await pool.query(
      'SELECT id, posted_by, view_count AS "viewCount", boost_stripe_session_id AS "boostStripeSessionId" FROM listings WHERE id = $1',
      [req.params.id]
    );
    if (listingResult.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    const listing = listingResult.rows[0];
    if (listing.posted_by !== req.user.id) return res.status(403).json({ error: 'You can only confirm a boost for your own listing.' });

    if (listing.boostStripeSessionId === sessionId) {
      return res.json({ ok: true }); // already activated from this exact payment
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'That payment has not completed yet.' });
    if (session.metadata.listingId !== String(listing.id) || session.metadata.userId !== String(req.user.id)) {
      return res.status(403).json({ error: 'That payment does not match this listing.' });
    }

    const [saveCountResult, conversationCountResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM saved_listings WHERE listing_id = $1', [listing.id]),
      pool.query('SELECT COUNT(DISTINCT buyer_id)::int AS count FROM conversations WHERE listing_id = $1', [listing.id])
    ]);

    await pool.query(
      `UPDATE listings SET
         boosted_until = now() + make_interval(days => $1),
         boost_started_at = now(),
         boost_view_count_at_start = $2,
         boost_save_count_at_start = $3,
         boost_conversation_count_at_start = $4,
         boost_stripe_session_id = $5
       WHERE id = $6`,
      [BOOST_DURATION_DAYS, listing.viewCount, saveCountResult.rows[0].count, conversationCountResult.rows[0].count, sessionId, listing.id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not confirm that boost.' });
  }
});

// Detail — contact info is only attached to the response if the request is authenticated.
// This is the real version of the "sign in to see contact info" gate: enforced by the
// server deciding what to send, not by the browser deciding what to show.
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    const l = result.rows[0];

    await pool.query(`UPDATE site_stats SET value = value + 1 WHERE key = 'listingviews'`);
    await pool.query('UPDATE listings SET view_count = view_count + 1 WHERE id = $1', [l.id]);
    const reportsResult = await pool.query('SELECT COUNT(*)::int AS count FROM reports WHERE listing_id = $1', [l.id]);
    const photosResult = await pool.query(
      'SELECT photo_thumb AS "thumb", photo_full AS "full" FROM listing_photos WHERE listing_id = $1 ORDER BY position ASC',
      [l.id]
    );
    // Fallback for listings created before the gallery table existed —
    // they only ever had the single cached cover photo.
    const photos = photosResult.rows.length > 0
      ? photosResult.rows
      : (l.photo_thumb ? [{ thumb: l.photo_thumb, full: l.photo_full || l.photo_thumb }] : []);

    let seller = null;
    if (l.posted_by) {
      const sellerResult = await pool.query('SELECT id, name, created_at, verification_status FROM users WHERE id = $1', [l.posted_by]);
      if (sellerResult.rows.length > 0) {
        const ratingResult = await pool.query(
          'SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS avg FROM reviews WHERE seller_id = $1',
          [l.posted_by]
        );
        seller = {
          id: sellerResult.rows[0].id,
          name: publicDisplayName(sellerResult.rows[0].name),
          memberSince: sellerResult.rows[0].created_at,
          verified: sellerResult.rows[0].verification_status === 'verified',
          reviewCount: ratingResult.rows[0].count,
          avgRating: Math.round(ratingResult.rows[0].avg * 10) / 10
        };
      }
    }

    let savedByMe = false;
    if (req.user) {
      const savedCheck = await pool.query('SELECT id FROM saved_listings WHERE user_id = $1 AND listing_id = $2', [req.user.id, l.id]);
      savedByMe = savedCheck.rows.length > 0;
    }

    const payload = {
      id: l.id, title: l.title, category: l.category, breed: l.breed, age: l.age, sex: l.sex,
      free: l.free, price: Number(l.price), openToTrade: l.open_to_trade, city: l.city, state: l.state, description: l.description,
      photoUrl: l.photo_thumb, photoFull: l.photo_full, photos, permitNumber: l.permit_number,
      dnaSexed: l.dna_sexed, handTame: l.hand_tame, condition: l.condition,
      createdAt: l.created_at, reportCount: reportsResult.rows[0].count,
      sold: l.status === 'sold', status: l.status, soldAt: l.sold_at, shippingAvailable: l.shipping_available,
      contactLocked: !req.user,
      postedByMe: !!(req.user && l.posted_by === req.user.id),
      savedByMe,
      seller
    };
    if (req.user) {
      payload.contactMethod = l.contact_method;
      payload.contactValue = l.contact_value;
      payload.posterName = l.poster_name;
    }
    res.json({ listing: payload });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load that listing.' });
  }
});

// Create — open to everyone, signed in or not. If the poster isn't signed in and gave
// an email as their contact method, this creates (or reuses) an account for them and
// signs them in, the same behavior the prototype had — except this version is real:
// the account genuinely exists in the database, with a real id, not just in memory.
router.post('/', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const required = ['title', 'category', 'city', 'state', 'description', 'contactMethod', 'contactValue'];
    for (const f of required) {
      if (!b[f] || !String(b[f]).trim()) return res.status(400).json({ error: `Missing required field: ${f}` });
    }
    if (!b.free && (b.price === undefined || b.price === null || Number(b.price) < 0)) {
      return res.status(400).json({ error: 'Enter a price, or mark the listing free.' });
    }
    // The captive-bred/ownership attestation is about live animals — it doesn't apply
    // to secondhand equipment, so Supplies listings skip it rather than showing a
    // checkbox that makes no sense for a cage or incubator.
    if (b.category !== 'SUP' && !b.attested) return res.status(400).json({ error: 'Please confirm the captive-bred and ownership attestation.' });
    if (!b.agreedTerms) return res.status(400).json({ error: 'Please confirm you are 18+ and agree to the Terms of Service and Privacy Policy.' });
    if (b.category === 'RAP' && !b.permitNumber) return res.status(400).json({ error: 'A falconry/raptor permit number is required to list a bird of prey.' });
    if (b.category === 'SUP' && !b.condition) return res.status(400).json({ error: 'Please select the condition of the item.' });

    const MAX_PHOTOS = 5;
    let photos = [];
    if (Array.isArray(b.photos) && b.photos.length > 0) {
      photos = b.photos.filter(p => p && p.thumb && p.full).slice(0, MAX_PHOTOS);
    } else if (b.photoThumb || b.photoFull) {
      // Backward-compatible single-photo path, in case anything still sends the old shape.
      photos = [{ thumb: b.photoThumb || b.photoFull, full: b.photoFull || b.photoThumb }];
    }
    const coverThumb = photos.length > 0 ? photos[0].thumb : null;
    const coverFull = photos.length > 0 ? photos[0].full : null;

    // Posting now always requires a real signed-in account (requireAuth above),
    // so posted_by is always known and poster name can default to the account
    // name if the seller left that field blank.
    const posterName = (b.posterName && String(b.posterName).trim()) || req.user.name;

    // Tri-state fields (yes/no/unknown) — anything unrecognized quietly falls
    // back to 'unknown' rather than erroring, since this is optional metadata.
    const VALID_TRISTATE = ['yes', 'no', 'unknown'];
    const dnaSexed = VALID_TRISTATE.includes(b.dnaSexed) ? b.dnaSexed : 'unknown';
    const handTame = VALID_TRISTATE.includes(b.handTame) ? b.handTame : 'unknown';
    const VALID_CONDITIONS = ['new', 'used_like_new', 'used_good', 'needs_repair'];
    const condition = (b.category === 'SUP' && VALID_CONDITIONS.includes(b.condition)) ? b.condition : null;

    const inserted = await pool.query(
      `INSERT INTO listings
        (title, category, breed, age, sex, free, price, open_to_trade, city, state, description,
         photo_thumb, photo_full, permit_number, poster_name, contact_method, contact_value, posted_by,
         dna_sexed, hand_tame, shipping_available, price_type, condition)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        b.title, b.category, b.breed || '', b.age || '', b.sex || '', !!b.free, b.free ? 0 : Number(b.price), !!b.openToTrade,
        b.city, b.state, b.description, coverThumb, coverFull,
        b.category === 'RAP' ? b.permitNumber : null, posterName, b.contactMethod, b.contactValue, req.user.id,
        dnaSexed, handTame, !!b.shippingAvailable, (b.priceType === 'total' ? 'total' : 'each'), condition
      ]
    );
    const newListing = inserted.rows[0];

    for (let i = 0; i < photos.length; i++) {
      await pool.query(
        'INSERT INTO listing_photos (listing_id, photo_thumb, photo_full, position) VALUES ($1, $2, $3, $4)',
        [newListing.id, photos[i].thumb, photos[i].full, i]
      );
    }

    res.json({ id: newListing.id });

    // Remember the seller's phone number on their profile for next time —
    // pure convenience, so the contact field can pre-fill on future posts.
    // Deliberately never does this for email, since that's tied to login
    // identity and shouldn't be silently overwritten by whatever someone
    // types into a listing's contact field.
    if (b.contactMethod === 'Phone' && b.contactValue) {
      pool.query('UPDATE users SET phone = $1 WHERE id = $2', [b.contactValue, req.user.id])
        .catch(err => console.error('Could not save phone to profile:', err));
    }

    // Fire after responding — a slow saved-search match/email round shouldn't
    // make the person who just posted wait for it.
    notifySavedSearches(newListing).catch(err => console.error('notifySavedSearches error:', err));

    // Best-effort — if this fails or the city/state can't be resolved to
    // coordinates, the listing still exists and just won't show a distance
    // in search results. Never blocks or fails the listing creation itself.
    //
    // Real coordinates from the seller actually selecting a Places
    // suggestion are used directly when available — skips a separate,
    // less-reliable Census lookup entirely (Census's own geocoder is built
    // for street addresses; a bare city/state can fail to resolve through
    // it even for real, well-known cities). Falls back to Census only when
    // no autocomplete selection was made (manual typing, or the feature
    // isn't configured at all).
    if (b.lat != null && b.lon != null && !isNaN(Number(b.lat)) && !isNaN(Number(b.lon))) {
      pool.query('UPDATE listings SET lat = $1, lon = $2 WHERE id = $3', [Number(b.lat), Number(b.lon), newListing.id])
        .catch(err => console.error('Could not save provided coordinates:', err));
    } else {
      geocodeCityState(newListing.city, newListing.state)
        .then(coords => {
          if (coords) {
            return pool.query('UPDATE listings SET lat = $1, lon = $2 WHERE id = $3', [coords.lat, coords.lon, newListing.id]);
          }
        })
        .catch(err => console.error('Geocoding update failed:', err));
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong publishing your listing.' });
  }
});

// Edit an existing listing — owner only. Reuses the same validation as
// creating one, since it's the same form on the frontend, just pre-filled.
// Photos are fully replaced rather than diffed: simpler and correct, since
// the frontend always sends the complete current set of photos either way.
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const check = await pool.query('SELECT posted_by FROM listings WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (check.rows[0].posted_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own listings.' });
    }

    const b = req.body || {};
    const required = ['title', 'category', 'city', 'state', 'description', 'contactMethod', 'contactValue'];
    for (const f of required) {
      if (!b[f] || !String(b[f]).trim()) return res.status(400).json({ error: `Missing required field: ${f}` });
    }
    if (!b.free && (b.price === undefined || b.price === null || Number(b.price) < 0)) {
      return res.status(400).json({ error: 'Enter a price, or mark the listing free.' });
    }
    if (b.category === 'RAP' && !b.permitNumber) return res.status(400).json({ error: 'A falconry/raptor permit number is required to list a bird of prey.' });
    if (b.category === 'SUP' && !b.condition) return res.status(400).json({ error: 'Please select the condition of the item.' });

    const MAX_PHOTOS = 5;
    let photos = [];
    if (Array.isArray(b.photos) && b.photos.length > 0) {
      photos = b.photos.filter(p => p && p.thumb && p.full).slice(0, MAX_PHOTOS);
    }
    const coverThumb = photos.length > 0 ? photos[0].thumb : null;
    const coverFull = photos.length > 0 ? photos[0].full : null;

    const posterName = (b.posterName && String(b.posterName).trim()) || req.user.name;
    const VALID_TRISTATE = ['yes', 'no', 'unknown'];
    const dnaSexed = VALID_TRISTATE.includes(b.dnaSexed) ? b.dnaSexed : 'unknown';
    const handTame = VALID_TRISTATE.includes(b.handTame) ? b.handTame : 'unknown';
    const VALID_CONDITIONS = ['new', 'used_like_new', 'used_good', 'needs_repair'];
    const condition = (b.category === 'SUP' && VALID_CONDITIONS.includes(b.condition)) ? b.condition : null;

    const updated = await pool.query(
      `UPDATE listings SET
         title = $1, category = $2, breed = $3, age = $4, sex = $5, free = $6, price = $7, open_to_trade = $8,
         city = $9, state = $10, description = $11, photo_thumb = $12, photo_full = $13, permit_number = $14,
         poster_name = $15, contact_method = $16, contact_value = $17, dna_sexed = $18, hand_tame = $19,
         shipping_available = $20, price_type = $21, condition = $22
       WHERE id = $23
       RETURNING *`,
      [
        b.title, b.category, b.breed || '', b.age || '', b.sex || '', !!b.free, b.free ? 0 : Number(b.price), !!b.openToTrade,
        b.city, b.state, b.description, coverThumb, coverFull,
        b.category === 'RAP' ? b.permitNumber : null, posterName, b.contactMethod, b.contactValue,
        dnaSexed, handTame, !!b.shippingAvailable, (b.priceType === 'total' ? 'total' : 'each'), condition, req.params.id
      ]
    );
    const listing = updated.rows[0];

    await pool.query('DELETE FROM listing_photos WHERE listing_id = $1', [req.params.id]);
    for (let i = 0; i < photos.length; i++) {
      await pool.query(
        'INSERT INTO listing_photos (listing_id, photo_thumb, photo_full, position) VALUES ($1, $2, $3, $4)',
        [listing.id, photos[i].thumb, photos[i].full, i]
      );
    }

    res.json({ id: listing.id });

    if (b.contactMethod === 'Phone' && b.contactValue) {
      pool.query('UPDATE users SET phone = $1 WHERE id = $2', [b.contactValue, req.user.id])
        .catch(err => console.error('Could not save phone to profile:', err));
    }

    // Best-effort re-geocode, same as on creation — city/state may have
    // changed. Same coordinate-source priority as creating a listing: real
    // Places-selected coordinates first, Census fallback otherwise.
    if (b.lat != null && b.lon != null && !isNaN(Number(b.lat)) && !isNaN(Number(b.lon))) {
      pool.query('UPDATE listings SET lat = $1, lon = $2 WHERE id = $3', [Number(b.lat), Number(b.lon), listing.id])
        .catch(err => console.error('Could not save provided coordinates:', err));
    } else {
      geocodeCityState(listing.city, listing.state)
        .then(coords => {
          if (coords) {
            return pool.query('UPDATE listings SET lat = $1, lon = $2 WHERE id = $3', [coords.lat, coords.lon, listing.id]);
          }
        })
        .catch(err => console.error('Geocoding update failed:', err));
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save your changes.' });
  }
});

router.post('/:id/report', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM listings WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    await pool.query('INSERT INTO reports (listing_id) VALUES ($1)', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not submit report.' });
  }
});

// A seller removing their own listing — distinct from the admin moderation
// delete below. Ownership is checked server-side against posted_by, not
// trusted from anything the client claims.
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const check = await pool.query('SELECT posted_by FROM listings WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (check.rows[0].posted_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only remove your own listings.' });
    }
    await pool.query('DELETE FROM listings WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not remove that listing.' });
  }
});

// Mark a listing sold or put it back to active — owner only, checked the
// same way as delete above. Marking sold pulls it out of the main browse
// feed (see GET / above) and adds it to the public "recently sold" feed.
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const check = await pool.query('SELECT posted_by FROM listings WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (check.rows[0].posted_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own listings.' });
    }
    const VALID_STATUSES = ['active', 'pending', 'sold'];
    if (!VALID_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Status must be active, pending, or sold.' });
    }
    if (req.body.status === 'sold') {
      // soldToUserId is optional — a seller can mark something sold without
      // picking a buyer (e.g. it sold outside Roost messaging). When given,
      // it must actually be someone who messaged about this listing, since
      // this is the real gate on who's allowed to leave a review afterward —
      // not just a label.
      let soldToUserId = null;
      if (req.body.soldToUserId) {
        const buyerCheck = await pool.query(
          'SELECT id FROM conversations WHERE listing_id = $1 AND seller_id = $2 AND buyer_id = $3',
          [req.params.id, req.user.id, req.body.soldToUserId]
        );
        if (buyerCheck.rows.length === 0) {
          return res.status(400).json({ error: 'That buyer hasn\'t messaged you about this listing.' });
        }
        soldToUserId = req.body.soldToUserId;
      }
      await pool.query(
        'UPDATE listings SET status = $1, sold = TRUE, sold_at = now(), sold_to_user_id = $2 WHERE id = $3',
        [req.body.status, soldToUserId, req.params.id]
      );
    } else {
      await pool.query('UPDATE listings SET status = $1, sold = FALSE, sold_at = NULL, sold_to_user_id = NULL WHERE id = $2', [req.body.status, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update that listing.' });
  }
});

// Buyers the seller can pick from when marking a listing sold — anyone
// who's messaged them about it. Owner-only, since this is only useful (and
// only meaningful) from the "mark as sold" flow.
router.get('/:id/buyers', requireAuth, async (req, res) => {
  try {
    const check = await pool.query('SELECT posted_by FROM listings WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (check.rows[0].posted_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only view buyers for your own listings.' });
    }
    const result = await pool.query(
      `SELECT u.id, u.name FROM conversations c JOIN users u ON u.id = c.buyer_id
       WHERE c.listing_id = $1 AND c.seller_id = $2 ORDER BY c.created_at ASC`,
      [req.params.id, req.user.id]
    );
    res.json({ buyers: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load buyers for that listing.' });
  }
});

// Start (or continue) a conversation about this listing. Requires sign-in —
// this is the messaging equivalent of the old "reveal contact info" gate.
router.post('/:id/message', requireAuth, async (req, res) => {
  try {
    const body = String((req.body && req.body.body) || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
    if (body.length > 2000) return res.status(400).json({ error: 'Message is too long.' });
    if (containsUrl(body)) return res.status(400).json({ error: 'Links aren\'t allowed in messages — this is to help keep everyone safe from off-platform scams.' });

    const listingResult = await pool.query('SELECT id, posted_by, title FROM listings WHERE id = $1', [req.params.id]);
    if (listingResult.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    const listing = listingResult.rows[0];

    if (!listing.posted_by) return res.status(400).json({ error: "This listing doesn't have a linked account to message." });
    if (listing.posted_by === req.user.id) return res.status(400).json({ error: "You can't message yourself about your own listing." });

    let convResult = await pool.query(
      'SELECT id FROM conversations WHERE listing_id = $1 AND buyer_id = $2',
      [listing.id, req.user.id]
    );
    let conversationId;
    if (convResult.rows.length > 0) {
      conversationId = convResult.rows[0].id;
    } else {
      const inserted = await pool.query(
        'INSERT INTO conversations (listing_id, buyer_id, seller_id) VALUES ($1, $2, $3) RETURNING id',
        [listing.id, req.user.id, listing.posted_by]
      );
      conversationId = inserted.rows[0].id;
    }

    await pool.query('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)', [conversationId, req.user.id, body]);
    res.json({ conversationId });

    // Notify the seller by email, after responding — never let a slow or
    // failed email hold up sending the actual message.
    pool.query('SELECT name, email FROM users WHERE id = $1', [listing.posted_by])
      .then(sellerResult => {
        const seller = sellerResult.rows[0];
        if (!seller) return;
        return sendNewMessageEmail({
          recipientEmail: seller.email, recipientName: seller.name,
          senderName: req.user.name, listingTitle: listing.title,
          messageBody: body, conversationId
        });
      })
      .catch(err => console.error('New-message email failed:', err));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not send that message.' });
  }
});

// Leave a review for the seller of this listing. Only allowed for the buyer
// the SELLER picked as who they sold it to (sold_to_user_id, set via
// PATCH /:id) — messaging a seller alone used to be enough, which meant
// literally anyone could leave a public rating without ever actually buying
// anything. Requiring the seller's own confirmation is slower for buyers
// (a seller has to actually mark it sold-to-them first) but means a review
// is real evidence of a completed deal, not just idle contact.
router.post('/:id/reviews', requireAuth, async (req, res) => {
  try {
    const rating = Number(req.body && req.body.rating);
    const comment = String((req.body && req.body.comment) || '').trim().slice(0, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
    }

    const listingResult = await pool.query('SELECT id, posted_by, sold_to_user_id AS "soldToUserId" FROM listings WHERE id = $1', [req.params.id]);
    if (listingResult.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    const listing = listingResult.rows[0];
    if (!listing.posted_by) return res.status(400).json({ error: 'This listing has no linked seller account to review.' });
    if (listing.posted_by === req.user.id) return res.status(400).json({ error: "You can't review your own listing." });

    if (listing.soldToUserId !== req.user.id) {
      return res.status(403).json({ error: "The seller hasn't marked you as the buyer for this listing yet." });
    }

    try {
      const inserted = await pool.query(
        `INSERT INTO reviews (listing_id, seller_id, reviewer_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [listing.id, listing.posted_by, req.user.id, rating, comment || null]
      );
      res.json({ id: inserted.rows[0].id });
    } catch (dbErr) {
      if (dbErr.code === '23505') { // unique_violation
        return res.status(409).json({ error: "You've already reviewed this seller for this listing." });
      }
      throw dbErr;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not submit your review.' });
  }
});

// ---- Admin-only routes below. requireAdmin checks the server-signed JWT's role
// claim on every request — this is the part a hardcoded client-side array could
// never actually provide. ----

router.get('/admin/reported', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.title, l.category, l.city, l.state, l.free, l.price, COUNT(r.id)::int AS "reportCount"
       FROM listings l JOIN reports r ON r.listing_id = l.id
       GROUP BY l.id ORDER BY "reportCount" DESC`
    );
    res.json({ listings: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load reported listings.' });
  }
});

// Powers the admin "backfill missing coordinates" tool. Runs from the
// admin's own browser (not the server), since the Places/Maps API key is
// restricted to the site's domain via HTTP referrer — a real browser
// request satisfies that; a server-to-server call from DigitalOcean
// would not. This just hands back the small list of what needs fixing.
router.get('/admin/missing-coords', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, city, state FROM listings WHERE lat IS NULL OR lon IS NULL ORDER BY id`
    );
    res.json({ listings: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load listings missing coordinates.' });
  }
});

// Admin-only, coordinates-only update — deliberately separate from the
// owner-only PUT /:id full-edit route. An admin fixing missing coordinates
// has no reason to touch (or need permission to touch) anything else
// about someone else's listing.
router.patch('/:id/coordinates', requireAdmin, async (req, res) => {
  try {
    if (req.body.lat == null || req.body.lon == null) {
      return res.status(400).json({ error: 'Valid lat and lon are required.' });
    }
    const lat = Number(req.body.lat);
    const lon = Number(req.body.lon);
    if (!isFinite(lat) || !isFinite(lon)) {
      return res.status(400).json({ error: 'Valid lat and lon are required.' });
    }
    const result = await pool.query(
      'UPDATE listings SET lat = $1, lon = $2 WHERE id = $3 RETURNING id',
      [lat, lon, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update coordinates.' });
  }
});

// Powers the admin "regenerate thumbnails" tool. Every existing listing
// already has a good, sharp full-size photo — only the thumbnail generation
// was ever broken, so this never needs to touch anyone's original photo or
// ask any seller to do anything. Runs from the admin's browser since
// resizing needs real canvas support, same reasoning as the coordinate
// backfill tool. Covers both the listing's cached cover photo AND every row
// in the multi-photo gallery table — a listing with 5 photos has 5 separate
// thumbnails that all need the same fix, not just the cover.
router.get('/admin/all-photos', requireAdmin, async (req, res) => {
  try {
    const covers = await pool.query(
      `SELECT id, photo_thumb AS "photoThumb", photo_full AS "photoFull" FROM listings WHERE photo_full IS NOT NULL`
    );
    const gallery = await pool.query(
      `SELECT id, photo_thumb AS "photoThumb", photo_full AS "photoFull" FROM listing_photos`
    );
    res.json({
      covers: covers.rows,
      gallery: gallery.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load photos.' });
  }
});

router.patch('/admin/photo-thumb', requireAdmin, async (req, res) => {
  try {
    const { type, id, thumbDataUrl } = req.body;
    if (!thumbDataUrl || !String(thumbDataUrl).startsWith('data:image')) {
      return res.status(400).json({ error: 'A valid thumbnail image is required.' });
    }
    // The old thumbnail is copied into the backup column in the SAME
    // statement that sets the new one — a real, atomic undo path, not a
    // separate "hope nothing goes wrong before I remember to back it up"
    // step. This is why the "Restore previous thumbnails" button below
    // actually works even after a full bulk regeneration.
    if (type === 'cover') {
      const result = await pool.query(
        'UPDATE listings SET photo_thumb_backup = photo_thumb, photo_thumb = $1 WHERE id = $2 RETURNING id',
        [thumbDataUrl, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    } else if (type === 'gallery') {
      const result = await pool.query(
        'UPDATE listing_photos SET photo_thumb_backup = photo_thumb, photo_thumb = $1 WHERE id = $2 RETURNING id',
        [thumbDataUrl, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Photo not found.' });
    } else {
      return res.status(400).json({ error: 'type must be "cover" or "gallery".' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update thumbnail.' });
  }
});

// Full undo for the regeneration tool — copies every backed-up thumbnail
// back into the live column, for both the cover photo and every gallery
// photo. Only touches rows that actually have a backup, so running this
// without ever having regenerated anything is a safe no-op, not an error.
router.post('/admin/restore-thumbnails', requireAdmin, async (req, res) => {
  try {
    const coversResult = await pool.query(
      `UPDATE listings SET photo_thumb = photo_thumb_backup, photo_thumb_backup = NULL
       WHERE photo_thumb_backup IS NOT NULL RETURNING id`
    );
    const galleryResult = await pool.query(
      `UPDATE listing_photos SET photo_thumb = photo_thumb_backup, photo_thumb_backup = NULL
       WHERE photo_thumb_backup IS NOT NULL RETURNING id`
    );
    res.json({ coversRestored: coversResult.rows.length, galleryRestored: galleryResult.rows.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not restore thumbnails.' });
  }
});

router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM listings WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not remove that listing.' });
  }
});

module.exports = router;
