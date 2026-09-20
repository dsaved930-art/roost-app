const express = require('express');
const router = express.Router();
const pool = require('../db');
const { publicDisplayName } = require('../utils/displayName');
const { requireAuth, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { hashPassword, comparePassword } = require('../utils/passwords');
const { containsUrl } = require('../utils/linkDetection');
const { makeGuard } = require('../utils/rateLimit');
const { sendPasswordChangedEmail, sendAccountDeletedEmail } = require('../utils/accountNotify');

// 5 wrong-password guesses per 15 minutes per account, shared across everything that asks for the
// current password (so guesses can't be doubled by alternating between changing and deleting).
const passwordGuard = makeGuard({ windowMs: 15 * 60 * 1000, maxFailures: 5 });
const { getNotificationPrefs, setMessageEmailPref } = require('../utils/notificationPrefs');

// The signed-in user's own email notification settings. Registered before '/:id/profile' so
// 'me' can never be mistaken for a user id.
router.get('/me/preferences', requireAuth, async (req, res) => {
  try {
    const prefs = await getNotificationPrefs(req.user.id);
    if (!prefs) return res.status(404).json({ error: 'Account not found.' });
    res.json(prefs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your notification settings.' });
  }
});

router.put('/me/preferences', requireAuth, async (req, res) => {
  try {
    const value = req.body && req.body.notifyNewMessages;
    if (typeof value !== 'boolean') return res.status(400).json({ error: 'notifyNewMessages must be true or false.' });
    const prefs = await setMessageEmailPref(req.user.id, value);
    if (!prefs) return res.status(404).json({ error: 'Account not found.' });
    res.json(prefs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save your notification settings.' });
  }
});

// ---- Edit display name ----
// The name shows on listings and in messages, so it can't be blank, can't be huge, and can't carry
// a link (same no-links rule as messages). Listings that were using the old account name pick up the
// new one; a listing where the seller deliberately chose a different poster name is left alone.
router.put('/me/name', requireAuth, async (req, res) => {
  const name = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim();
  if (!name) return res.status(400).json({ error: 'Please enter a name.' });
  if (name.length > 60) return res.status(400).json({ error: 'That name is too long. Please keep it under 60 characters.' });
  if (containsUrl(name)) return res.status(400).json({ error: 'Names can\'t contain links.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id, email, role, name FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (current.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Account not found.' }); }
    const user = current.rows[0];
    await client.query('UPDATE users SET name = $1 WHERE id = $2', [name, user.id]);
    await client.query('UPDATE listings SET poster_name = $1 WHERE posted_by = $2 AND poster_name = $3', [name, user.id, user.name]);
    await client.query('COMMIT');
    setAuthCookie(res, { id: user.id, email: user.email, role: user.role, name }); // the login cookie carries the name, so refresh it
    res.json({ name });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: 'Could not save your name.' });
  } finally {
    client.release();
  }
});

// ---- Change password ----
router.post('/me/password', requireAuth, passwordGuard.middleware, async (req, res) => {
  try {
    const currentPassword = String((req.body && req.body.currentPassword) || '');
    const newPassword = String((req.body && req.body.newPassword) || '');
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Enter your current password and a new one.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Your new password should be at least 6 characters.' });
    if (newPassword === currentPassword) return res.status(400).json({ error: 'Your new password needs to be different from your current one.' });

    const result = await pool.query('SELECT id, email, role, name, password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (!user.password_hash) return res.status(400).json({ error: 'This account doesn\'t have a password yet. Use "Forgot password" on the login screen to set one.' });
    if (!(await comparePassword(currentPassword, user.password_hash))) {
      passwordGuard.recordFailure(req);
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    }
    passwordGuard.reset(req);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), user.id]);
    setAuthCookie(res, user);
    res.json({ ok: true });
    sendPasswordChangedEmail({ email: user.email, name: user.name }).catch(err => console.error('Password-changed email failed:', err));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not change your password.' });
  }
});

// ---- Delete account ----
// Permanent. Needs the password (when the account has one) AND the word DELETE typed out. Admin
// accounts can't be deleted here, so the site can never be locked out of its own admin by a stray click.
//
// Listings are deleted explicitly on purpose: the database only sets posted_by to NULL when a user is
// removed, which would leave their listings, contact details and all, live on the site with no owner.
// Everything else (messages and threads, reactions, reviews, saved searches, saved listings, tokens)
// is removed by the database's own cascade rules in the same transaction.
router.post('/me/delete', requireAuth, passwordGuard.middleware, async (req, res) => {
  const password = String((req.body && req.body.password) || '');
  if (!req.body || req.body.confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm.' });

  const client = await pool.connect();
  try {
    const result = await client.query('SELECT id, email, name, role, password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Admin accounts can\'t be deleted from here.' });
    if (user.password_hash) {
      if (!password) return res.status(400).json({ error: 'Enter your password to confirm.' });
      if (!(await comparePassword(password, user.password_hash))) {
        passwordGuard.recordFailure(req);
        return res.status(400).json({ error: 'That password is incorrect.' });
      }
      passwordGuard.reset(req);
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM listings WHERE posted_by = $1', [user.id]);
    await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    await client.query('COMMIT');

    clearAuthCookie(res);
    res.json({ ok: true });
    sendAccountDeletedEmail({ email: user.email, name: user.name }).catch(err => console.error('Account-deleted email failed:', err));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: 'Could not delete your account.' });
  } finally {
    client.release();
  }
});

// Public — anyone can view a seller's profile and reviews, signed in or not.
// This is a trust signal meant to be seen before deciding to message someone.
router.get('/:id/profile', async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, name, created_at, verification_status FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const user = userResult.rows[0];

    const ratingResult = await pool.query(
      'SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS avg FROM reviews WHERE seller_id = $1',
      [user.id]
    );

    const reviewsResult = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at AS "createdAt", u.name AS "reviewerName", l.title AS "listingTitle"
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       JOIN listings l ON l.id = r.listing_id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [user.id]
    );
    const publicReviews = reviewsResult.rows.map(r => ({ ...r, reviewerName: publicDisplayName(r.reviewerName) }));

    const listingsResult = await pool.query(
      `SELECT id, title, category, breed, free, price, price_type AS "priceType", city, state, photo_thumb AS "photoUrl", created_at AS "createdAt"
       FROM listings WHERE posted_by = $1 ORDER BY created_at DESC LIMIT 12`,
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        name: publicDisplayName(user.name),
        memberSince: user.created_at,
        verified: user.verification_status === 'verified',
        avgRating: Math.round(ratingResult.rows[0].avg * 10) / 10,
        reviewCount: ratingResult.rows[0].count
      },
      reviews: publicReviews,
      listings: listingsResult.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load this profile.' });
  }
});

module.exports = router;
