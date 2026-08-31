const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const MAX_SAVED_SEARCHES_PER_USER = 20;

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, category, query, price_min AS "priceMin", price_max AS "priceMax",
              location_text AS "locationText", trade_only AS "tradeOnly", email_alerts AS "emailAlerts", created_at AS "createdAt"
       FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ savedSearches: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your saved searches.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Give this search a name.' });

    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM saved_searches WHERE user_id = $1', [req.user.id]);
    if (countResult.rows[0].count >= MAX_SAVED_SEARCHES_PER_USER) {
      return res.status(400).json({ error: `You can save up to ${MAX_SAVED_SEARCHES_PER_USER} searches.` });
    }

    const category = b.category && b.category !== 'all' ? b.category : null;
    const query = b.query && String(b.query).trim() ? String(b.query).trim() : null;
    const priceMin = (b.priceMin !== undefined && b.priceMin !== null && b.priceMin !== '') ? Number(b.priceMin) : null;
    const priceMax = (b.priceMax !== undefined && b.priceMax !== null && b.priceMax !== '') ? Number(b.priceMax) : null;
    const locationText = b.locationText && String(b.locationText).trim() ? String(b.locationText).trim() : null;
    const tradeOnly = !!b.tradeOnly;
    const emailAlerts = b.emailAlerts !== false;

    const inserted = await pool.query(
      `INSERT INTO saved_searches (user_id, name, category, query, price_min, price_max, location_text, trade_only, email_alerts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.user.id, name, category, query, priceMin, priceMax, locationText, tradeOnly, emailAlerts]
    );
    res.json({ id: inserted.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save that search.' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM saved_searches WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Saved search not found.' });

    if (typeof req.body.emailAlerts === 'boolean') {
      await pool.query('UPDATE saved_searches SET email_alerts = $1 WHERE id = $2', [req.body.emailAlerts, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update that saved search.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Saved search not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not delete that saved search.' });
  }
});

// Notification feed — new listings that matched one of this user's saved searches.
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ssm.id, ssm.notified_at AS "notifiedAt", ssm.read_at AS "readAt",
              ss.name AS "searchName",
              l.id AS "listingId", l.title AS "listingTitle", l.free, l.price,
              l.city, l.state, l.photo_thumb AS "listingPhoto"
       FROM saved_search_matches ssm
       JOIN saved_searches ss ON ss.id = ssm.saved_search_id
       JOIN listings l ON l.id = ssm.listing_id
       WHERE ss.user_id = $1
       ORDER BY ssm.notified_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your notifications.' });
  }
});

router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM saved_search_matches ssm JOIN saved_searches ss ON ss.id = ssm.saved_search_id
       WHERE ss.user_id = $1 AND ssm.read_at IS NULL`,
      [req.user.id]
    );
    res.json({ count: result.rows[0].count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load unread count.' });
  }
});

router.post('/notifications/mark-read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE saved_search_matches SET read_at = now()
       WHERE read_at IS NULL AND saved_search_id IN (SELECT id FROM saved_searches WHERE user_id = $1)`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not mark notifications as read.' });
  }
});

module.exports = router;
