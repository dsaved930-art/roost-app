const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Apply for (or reapply for) verified breeder status.
router.post('/apply', requireAuth, async (req, res) => {
  try {
    const businessName = String((req.body && req.body.businessName) || '').trim();
    const phone = String((req.body && req.body.phone) || '').trim();
    const document = (req.body && req.body.document) || null;

    if (!businessName || !phone) {
      return res.status(400).json({ error: 'Business/breeder name and a phone number are required.' });
    }

    const current = await pool.query('SELECT verification_status FROM users WHERE id = $1', [req.user.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
    if (current.rows[0].verification_status === 'pending') {
      return res.status(400).json({ error: 'Your application is already under review.' });
    }
    if (current.rows[0].verification_status === 'verified') {
      return res.status(400).json({ error: "You're already verified." });
    }

    await pool.query(
      `UPDATE users SET
         verification_status = 'pending',
         verification_business_name = $1,
         verification_phone = $2,
         verification_document = $3,
         verification_note = NULL,
         verification_requested_at = now(),
         verification_reviewed_at = NULL
       WHERE id = $4`,
      [businessName, phone, document, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not submit your application.' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT verification_status AS "status", verification_note AS "note",
              verification_business_name AS "businessName", verification_phone AS "phone",
              verification_requested_at AS "requestedAt"
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0] || { status: 'none' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your verification status.' });
  }
});

// ---- Admin review ----

router.get('/admin/pending', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, verification_business_name AS "businessName", verification_phone AS "phone",
              verification_document AS "document", verification_requested_at AS "requestedAt"
       FROM users WHERE verification_status = 'pending'
       ORDER BY verification_requested_at ASC`
    );
    res.json({ pending: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load pending applications.' });
  }
});

router.post('/admin/:userId/approve', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET verification_status = 'verified', verification_reviewed_at = now(), verification_note = NULL
       WHERE id = $1 AND verification_status = 'pending' RETURNING id`,
      [req.params.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No pending application found for that user.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not approve that application.' });
  }
});

router.post('/admin/:userId/reject', requireAdmin, async (req, res) => {
  try {
    const note = String((req.body && req.body.note) || '').trim() || 'No reason given.';
    const result = await pool.query(
      `UPDATE users SET verification_status = 'rejected', verification_reviewed_at = now(), verification_note = $1
       WHERE id = $2 AND verification_status = 'pending' RETURNING id`,
      [note, req.params.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No pending application found for that user.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not reject that application.' });
  }
});

module.exports = router;
