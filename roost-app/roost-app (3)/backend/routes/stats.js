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

// Admin-only now — this used to be public in the prototype. Real traffic numbers
// are exactly the kind of thing that shouldn't be visible to every visitor.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query('SELECT key, value FROM site_stats');
    const accounts = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const listings = await pool.query('SELECT COUNT(*)::int AS count FROM listings');
    const reported = await pool.query('SELECT COUNT(DISTINCT listing_id)::int AS count FROM reports');

    const out = {};
    stats.rows.forEach(r => { out[r.key] = Number(r.value); });
    out.accounts = accounts.rows[0].count;
    out.listingsPosted = listings.rows[0].count;
    out.reportedListings = reported.rows[0].count;
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

module.exports = router;
