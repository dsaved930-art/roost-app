const pool = require('../db');
const { BOOST_DURATION_HOURS } = require('../config/boost');

// Shared by every path that can activate a boost — the free-trial button,
// the post-payment confirm call from the success page, and the Stripe
// webhook — so "what counts as activating a boost" can't drift between them,
// and so whichever of confirm/webhook arrives second is a safe no-op instead
// of double-charging the view/save/message snapshot. priceCentsPaid is 0
// during the free trial, purely for admin stats later — never shown to sellers.
async function activateBoost(listingId, stripeSessionId, priceCentsPaid) {
  const listingResult = await pool.query(
    'SELECT view_count AS "viewCount", boost_stripe_session_id AS "boostStripeSessionId" FROM listings WHERE id = $1',
    [listingId]
  );
  if (listingResult.rows.length === 0) return false;
  const listing = listingResult.rows[0];

  // Idempotency: a real session id that's already been applied means this
  // exact payment already activated the boost, via whichever of confirm/
  // webhook got here first — the other one should just no-op.
  if (stripeSessionId && listing.boostStripeSessionId === stripeSessionId) {
    return true;
  }

  const [saveCountResult, conversationCountResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM saved_listings WHERE listing_id = $1', [listingId]),
    pool.query('SELECT COUNT(DISTINCT buyer_id)::int AS count FROM conversations WHERE listing_id = $1', [listingId])
  ]);

  await pool.query(
    `UPDATE listings SET
       boosted_until = now() + make_interval(hours => $1),
       boost_started_at = now(),
       boost_view_count_at_start = $2,
       boost_save_count_at_start = $3,
       boost_conversation_count_at_start = $4,
       boost_stripe_session_id = $5,
       boost_checkout_locked_until = NULL,
       boost_result_acknowledged = FALSE,
       boost_price_paid_cents = $6
     WHERE id = $7`,
    [BOOST_DURATION_HOURS, listing.viewCount, saveCountResult.rows[0].count, conversationCountResult.rows[0].count, stripeSessionId, priceCentsPaid, listingId]
  );
  return true;
}

// Lets a seller end their own boost early if they don't want the exposure
// anymore — no refund (that's a separate, explicit policy shown in the UI),
// just stops it early. Only touches boosted_until: boost_started_at and the
// snapshot counts stay put, so results still display normally afterward.
async function endBoostEarly(listingId) {
  const result = await pool.query(
    `UPDATE listings SET boosted_until = now() WHERE id = $1 AND boosted_until > now() RETURNING id`,
    [listingId]
  );
  return result.rows.length > 0;
}

// Marks a completed boost's results as "shown" so the results popup fires
// exactly once per boost, not every time the seller opens My Listings.
async function acknowledgeBoostResult(listingId) {
  await pool.query('UPDATE listings SET boost_result_acknowledged = TRUE WHERE id = $1', [listingId]);
}

module.exports = { activateBoost, endBoostEarly, acknowledgeBoostResult };
