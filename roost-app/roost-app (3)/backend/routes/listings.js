const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { notifySavedSearches } = require('../services/alerts');
const { geocodeCityState } = require('../utils/geocode');

// Browse — summaries only. Contact info is never included here, at all, for anyone.
// Sold listings are excluded here so buyers don't wade through unavailable
// birds — they still exist and are visible via GET /sold and their own detail page.
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.title, l.category, l.breed, l.age, l.sex, l.free, l.price, l.open_to_trade AS "openToTrade", l.city, l.state,
              l.photo_thumb AS "photoUrl", l.created_at AS "createdAt", l.lat, l.lon,
              l.status, l.shipping_available AS "shippingAvailable",
              COALESCE(u.verification_status = 'verified', FALSE) AS "sellerVerified"
       FROM listings l LEFT JOIN users u ON u.id = l.posted_by
       WHERE l.status != 'sold'
       ORDER BY l.created_at DESC`
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
      `SELECT id, title, category, free, price, city, state, photo_thumb AS "photoUrl", sold_at AS "soldAt"
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
      `SELECT l.id, l.title, l.category, l.free, l.price, l.city, l.state, l.status, l.sold_at AS "soldAt",
              l.photo_thumb AS "photoUrl", l.created_at AS "createdAt", l.view_count AS "viewCount",
              (SELECT COUNT(DISTINCT buyer_id)::int FROM conversations WHERE listing_id = l.id) AS "conversationCount",
              (SELECT COUNT(*)::int FROM saved_search_matches WHERE listing_id = l.id) AS "alertMatches"
       FROM listings l
       WHERE l.posted_by = $1
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    res.json({ listings: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your listings.' });
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
          name: sellerResult.rows[0].name,
          memberSince: sellerResult.rows[0].created_at,
          verified: sellerResult.rows[0].verification_status === 'verified',
          reviewCount: ratingResult.rows[0].count,
          avgRating: Math.round(ratingResult.rows[0].avg * 10) / 10
        };
      }
    }

    const payload = {
      id: l.id, title: l.title, category: l.category, breed: l.breed, age: l.age, sex: l.sex,
      free: l.free, price: Number(l.price), openToTrade: l.open_to_trade, city: l.city, state: l.state, description: l.description,
      photoUrl: l.photo_thumb, photoFull: l.photo_full, photos, permitNumber: l.permit_number,
      dnaSexed: l.dna_sexed, handTame: l.hand_tame,
      createdAt: l.created_at, reportCount: reportsResult.rows[0].count,
      sold: l.status === 'sold', status: l.status, soldAt: l.sold_at, shippingAvailable: l.shipping_available,
      contactLocked: !req.user,
      postedByMe: !!(req.user && l.posted_by === req.user.id),
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
    if (!b.attested) return res.status(400).json({ error: 'Please confirm the captive-bred and ownership attestation.' });
    if (!b.agreedTerms) return res.status(400).json({ error: 'Please confirm you are 18+ and agree to the Terms of Service and Privacy Policy.' });
    if (b.category === 'RAP' && !b.permitNumber) return res.status(400).json({ error: 'A falconry/raptor permit number is required to list a bird of prey.' });

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

    const inserted = await pool.query(
      `INSERT INTO listings
        (title, category, breed, age, sex, free, price, open_to_trade, city, state, description,
         photo_thumb, photo_full, permit_number, poster_name, contact_method, contact_value, posted_by,
         dna_sexed, hand_tame, shipping_available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        b.title, b.category, b.breed || '', b.age || '', b.sex || '', !!b.free, b.free ? 0 : Number(b.price), !!b.openToTrade,
        b.city, b.state, b.description, coverThumb, coverFull,
        b.category === 'RAP' ? b.permitNumber : null, posterName, b.contactMethod, b.contactValue, req.user.id,
        dnaSexed, handTame, !!b.shippingAvailable
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

    // Fire after responding — a slow saved-search match/email round shouldn't
    // make the person who just posted wait for it.
    notifySavedSearches(newListing).catch(err => console.error('notifySavedSearches error:', err));

    // Best-effort — if this fails or the city/state can't be resolved to
    // coordinates, the listing still exists and just won't show a distance
    // in search results. Never blocks or fails the listing creation itself.
    geocodeCityState(newListing.city, newListing.state)
      .then(coords => {
        if (coords) {
          return pool.query('UPDATE listings SET lat = $1, lon = $2 WHERE id = $3', [coords.lat, coords.lon, newListing.id]);
        }
      })
      .catch(err => console.error('Geocoding update failed:', err));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong publishing your listing.' });
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
      await pool.query('UPDATE listings SET status = $1, sold = TRUE, sold_at = now() WHERE id = $2', [req.body.status, req.params.id]);
    } else {
      await pool.query('UPDATE listings SET status = $1, sold = FALSE, sold_at = NULL WHERE id = $2', [req.body.status, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update that listing.' });
  }
});

// Start (or continue) a conversation about this listing. Requires sign-in —
// this is the messaging equivalent of the old "reveal contact info" gate.
router.post('/:id/message', requireAuth, async (req, res) => {
  try {
    const body = String((req.body && req.body.body) || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
    if (body.length > 2000) return res.status(400).json({ error: 'Message is too long.' });

    const listingResult = await pool.query('SELECT id, posted_by FROM listings WHERE id = $1', [req.params.id]);
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not send that message.' });
  }
});

// Leave a review for the seller of this listing. Only allowed if the reviewer
// actually messaged the seller about this specific listing first — this is
// the closest thing we have to "proof of a real interaction" without payment
// data to verify an actual sale.
router.post('/:id/reviews', requireAuth, async (req, res) => {
  try {
    const rating = Number(req.body && req.body.rating);
    const comment = String((req.body && req.body.comment) || '').trim().slice(0, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
    }

    const listingResult = await pool.query('SELECT id, posted_by FROM listings WHERE id = $1', [req.params.id]);
    if (listingResult.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    const listing = listingResult.rows[0];
    if (!listing.posted_by) return res.status(400).json({ error: 'This listing has no linked seller account to review.' });
    if (listing.posted_by === req.user.id) return res.status(400).json({ error: "You can't review your own listing." });

    const convCheck = await pool.query(
      'SELECT id FROM conversations WHERE listing_id = $1 AND buyer_id = $2',
      [listing.id, req.user.id]
    );
    if (convCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Message this seller about the listing before leaving a review.' });
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
