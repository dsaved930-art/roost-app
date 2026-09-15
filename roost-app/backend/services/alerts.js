const pool = require('../db');
const { sendMail } = require('../utils/email');

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function publicUrl() {
  return (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

// Mirrors the same matching logic the frontend's filter panel uses, so a
// saved search behaves exactly like "the filters you had on when you saved it."
function matchesSearch(search, listing) {
  if (search.category && search.category !== listing.category) return false;

  if (search.query) {
    const hay = `${listing.title} ${listing.breed} ${listing.city} ${listing.state}`.toLowerCase();
    if (!hay.includes(search.query.toLowerCase())) return false;
  }

  if (search.price_min !== null && search.price_min !== undefined) {
    if (listing.free && Number(search.price_min) > 0) return false;
    if (!listing.free && Number(listing.price) < Number(search.price_min)) return false;
  }
  if (search.price_max !== null && search.price_max !== undefined) {
    if (!listing.free && Number(listing.price) > Number(search.price_max)) return false;
  }

  if (search.location_text) {
    const hay = `${listing.city} ${listing.state}`.toLowerCase();
    if (!hay.includes(search.location_text.toLowerCase())) return false;
  }

  if (search.trade_only && !listing.open_to_trade) return false;

  return true;
}

// Called right after a listing is inserted. Finds every saved search it
// matches, records an in-app notification for each, and emails the ones that
// have email alerts turned on (if SMTP is configured — if not, this just
// silently skips the email and the in-app notification still works).
async function notifySavedSearches(listing) {
  try {
    const searchesResult = await pool.query(
      `SELECT ss.*, u.email AS user_email, u.name AS user_name
       FROM saved_searches ss JOIN users u ON u.id = ss.user_id`
    );

    for (const search of searchesResult.rows) {
      if (search.user_id === listing.posted_by) continue; // don't notify someone about their own listing
      if (!matchesSearch(search, listing)) continue;

      let inserted;
      try {
        inserted = await pool.query(
          'INSERT INTO saved_search_matches (saved_search_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
          [search.id, listing.id]
        );
      } catch (e) {
        continue; // if this fails for one search, don't let it break the others
      }
      if (inserted.rows.length === 0) continue; // already notified for this pair

      if (search.email_alerts) {
        const priceText = listing.free ? 'Free' : `$${listing.price}`;
        const link = `${publicUrl()}/listing/${listing.id}`;
        sendMail({
          to: search.user_email,
          subject: `New match for your saved search "${search.name}"`,
          text: `${listing.title} — ${priceText} — ${listing.city}, ${listing.state}\n\nThis matches your saved search "${search.name}" on Roost.\n\nSee it here: ${link}`,
          html: `
            <p><strong>${escHtml(listing.title)}</strong> — ${escHtml(priceText)} — ${escHtml(listing.city)}, ${escHtml(listing.state)}</p>
            <p>This matches your saved search "${escHtml(search.name)}" on Roost.</p>
            <p><a href="${link}" style="display:inline-block;background:#1B74E4;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">See it on Roost</a></p>
          `
        }).catch(err => console.error('Saved-search email failed:', err));
      }
    }
  } catch (e) {
    console.error('notifySavedSearches failed:', e);
    // Never let a notification failure block the listing from being created.
  }
}

module.exports = { matchesSearch, notifySavedSearches };
