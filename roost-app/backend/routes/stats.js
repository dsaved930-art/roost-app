const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Hit on every single page load, unauthenticated — the highest-traffic route
// in the app, which makes try/catch here especially important. Never let a
// pageview-tracking hiccup take down the whole server.
router.post('/pageview', async (req, res) => {
  try {
    await pool.query(`UPDATE site_stats SET value = value + 1 WHERE key = 'pageviews'`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not record pageview.' });
  }
});

// Admin-only — this used to be public in the prototype. Real traffic numbers
// are exactly the kind of thing that shouldn't be visible to every visitor.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query('SELECT key, value FROM site_stats');
    const accounts = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const listings = await pool.query('SELECT COUNT(*)::int AS count FROM listings');
    const reported = await pool.query('SELECT COUNT(DISTINCT listing_id)::int AS count FROM reports');

    // Growth — new listings and new signups per week, most recent 8 weeks.
    // Both queries are shaped the same way on purpose so the frontend can
    // render them with one shared function.
    const weeklyListings = await pool.query(
      `SELECT to_char(date_trunc('week', created_at), 'Mon DD') AS week, COUNT(*)::int AS count
       FROM listings
       WHERE created_at > now() - interval '8 weeks'
       GROUP BY date_trunc('week', created_at)
       ORDER BY date_trunc('week', created_at) ASC`
    );
    const weeklySignups = await pool.query(
      `SELECT to_char(date_trunc('week', created_at), 'Mon DD') AS week, COUNT(*)::int AS count
       FROM users
       WHERE created_at > now() - interval '8 weeks'
       GROUP BY date_trunc('week', created_at)
       ORDER BY date_trunc('week', created_at) ASC`
    );

    // Geography — where is there already real density, vs. where is it thin.
    const topLocations = await pool.query(
      `SELECT city, state, COUNT(*)::int AS count
       FROM listings
       GROUP BY city, state
       ORDER BY count DESC
       LIMIT 8`
    );

    // Category breakdown — which bird communities are actually engaging.
    const categoryBreakdown = await pool.query(
      `SELECT category, COUNT(*)::int AS count
       FROM listings
       GROUP BY category
       ORDER BY count DESC`
    );

    // Engagement funnel — real proof the marketplace produces outcomes, not
    // just traffic. total views comes from the per-listing view_count column
    // (summed), separate from the site-wide pageviews counter above.
    const totalViewsResult = await pool.query('SELECT COALESCE(SUM(view_count), 0)::int AS total FROM listings');
    const totalMessagesResult = await pool.query('SELECT COUNT(*)::int AS total FROM messages');
    const totalConversationsResult = await pool.query('SELECT COUNT(*)::int AS total FROM conversations');

    // Average time-to-sale, in days, for listings that have actually sold.
    const avgDaysToSaleResult = await pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (sold_at - created_at)) / 86400)::numeric, 1) AS avg_days
       FROM listings
       WHERE status = 'sold' AND sold_at IS NOT NULL`
    );

    const verifiedBreedersResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE verification_status = 'verified'`
    );
    const savedSearchStatsResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users FROM saved_searches`
    );

    const out = {};
    stats.rows.forEach(r => { out[r.key] = Number(r.value); });
    out.accounts = accounts.rows[0].count;
    out.listingsPosted = listings.rows[0].count;
    out.reportedListings = reported.rows[0].count;
    out.weeklyListings = weeklyListings.rows;
    out.weeklySignups = weeklySignups.rows;
    out.topLocations = topLocations.rows;
    out.categoryBreakdown = categoryBreakdown.rows;
    out.totalListingViews = totalViewsResult.rows[0].total;
    out.totalMessages = totalMessagesResult.rows[0].total;
    out.totalConversations = totalConversationsResult.rows[0].total;
    out.avgDaysToSale = avgDaysToSaleResult.rows[0].avg_days;
    out.verifiedBreeders = verifiedBreedersResult.rows[0].count;
    out.savedSearchTotal = savedSearchStatsResult.rows[0].total;
    out.savedSearchUsers = savedSearchStatsResult.rows[0].users;
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

module.exports = router;
