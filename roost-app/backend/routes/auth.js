const express = require('express');
const router = express.Router();
const pool = require('../db');
const { hashPassword, comparePassword } = require('../utils/passwords');
const { setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/emailVerification');
const { sendPasswordResetEmail } = require('../utils/passwordReset');
const { requireAuth } = require('../middleware/auth');
const { makeGuard } = require('../utils/rateLimit');

function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ---- Rate limiting ----
// Two layers on login, same idea as a bank card: a few wrong PINs on YOUR card locks your card,
// not everyone's. "Per account" stops someone guessing passwords against one target email; "per IP"
// stops someone spraying many different emails from one source. Only real failures count — a typo'd
// email that doesn't exist, or a wrong password, count; a successful login only resets the per-account
// counter (an IP that succeeds once could still be mid-spray against other accounts).
const loginPerAccountGuard = makeGuard({
  windowMs: 15 * 60 * 1000, maxFailures: 10,
  keyOf: req => 'login-acct:' + req.ip + ':' + normalizeEmail(req.body && req.body.email)
});
const loginPerIpGuard = makeGuard({ windowMs: 15 * 60 * 1000, maxFailures: 30, keyOf: req => 'login-ip:' + req.ip });

// Signup and forgot-password both send a real email, so every attempt has a cost even when it's
// perfectly valid — these count ALL attempts, not just failed ones (see record() vs recordFailure()).
const signupGuard = makeGuard({ windowMs: 60 * 60 * 1000, maxFailures: 8, keyOf: req => 'signup-ip:' + req.ip });
const forgotPasswordIpGuard = makeGuard({ windowMs: 15 * 60 * 1000, maxFailures: 8, keyOf: req => 'forgot-ip:' + req.ip });
const forgotPasswordEmailGuard = makeGuard({
  windowMs: 60 * 60 * 1000, maxFailures: 3,
  keyOf: req => 'forgot-email:' + normalizeEmail(req.body && req.body.email)
});

// A reset token is long and random, so guessing one directly isn't realistic — this is just a
// backstop against a script hammering the endpoint, not a defense the token's own randomness
// doesn't already provide.
const resetPasswordGuard = makeGuard({ windowMs: 15 * 60 * 1000, maxFailures: 20, keyOf: req => 'reset-ip:' + req.ip });


router.post('/signup', signupGuard.middleware, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password should be at least 6 characters.' });
    signupGuard.record(req);

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (existing.rows.length > 0) {
      const found = existing.rows[0];
      if (found.password_hash) {
        return res.status(409).json({ error: 'An account with that email already exists — try logging in instead.' });
      }
      // This account was auto-created when the person posted a listing without signing up first.
      // Signing up with the same email claims it and sets a real password.
      const hash = await hashPassword(password);
      const updated = await pool.query(
        'UPDATE users SET name = $1, password_hash = $2, auto_created = FALSE WHERE id = $3 RETURNING *',
        [name, hash, found.id]
      );
      user = updated.rows[0];
    } else {
      const hash = await hashPassword(password);
      const inserted = await pool.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, email, hash, 'user']
      );
      user = inserted.rows[0];
    }

    setAuthCookie(res, user);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.email_verified, verificationStatus: user.verification_status, verificationNote: user.verification_note } });

    sendVerificationEmail(user).catch(err => console.error('sendVerificationEmail failed:', err));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

router.post('/login', loginPerAccountGuard.middleware, loginPerIpGuard.middleware, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      loginPerAccountGuard.recordFailure(req); loginPerIpGuard.recordFailure(req);
      return res.status(404).json({ error: 'No account found with that email.' });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      loginPerAccountGuard.recordFailure(req); loginPerIpGuard.recordFailure(req);
      return res.status(400).json({ error: "This account doesn't have a password yet — sign up with this same email to set one." });
    }

    const ok = await comparePassword(password, user.password_hash);
    if (!ok) {
      loginPerAccountGuard.recordFailure(req); loginPerIpGuard.recordFailure(req);
      return res.status(401).json({ error: 'Incorrect password.' });
    }
    loginPerAccountGuard.reset(req); // the per-IP counter is deliberately left alone — see comment above

    setAuthCookie(res, user);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.email_verified, verificationStatus: user.verification_status, verificationNote: user.verification_note } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong logging in.' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  try {
    const result = await pool.query(
      `SELECT id, name, email, phone, role, email_verified AS "emailVerified", verification_status AS "verificationStatus",
              verification_note AS "verificationNote"
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.json({ user: null });
    res.json({ user: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your account.' });
  }
});

router.get('/verify-email', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.redirect('/?verify=missing');
  try {
    const result = await pool.query('SELECT * FROM email_verification_tokens WHERE token = $1', [token]);
    if (result.rows.length === 0) return res.redirect('/?verify=invalid');
    const record = result.rows[0];
    if (new Date(record.expires_at) < new Date()) return res.redirect('/?verify=expired');

    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [record.user_id]);
    await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [record.user_id]);
    res.redirect('/?verify=success');
  } catch (e) {
    console.error(e);
    res.redirect('/?verify=error');
  }
});

router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.email_verified) return res.status(400).json({ error: 'Your email is already verified.' });

    await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [user.id]);
    await sendVerificationEmail(user);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not send a new verification email.' });
  }
});

router.post('/forgot-password', forgotPasswordIpGuard.middleware, forgotPasswordEmailGuard.middleware, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    forgotPasswordIpGuard.record(req);
    forgotPasswordEmailGuard.record(req);

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    // Deliberately the same response whether or not the account exists —
    // otherwise this endpoint would let anyone check which emails have
    // accounts on Roost just by watching which requests get a different reply.
    const genericResponse = { ok: true, message: "If an account exists for that email, we've sent a password reset link." };

    if (result.rows.length === 0) return res.json(genericResponse);
    const user = result.rows[0];
    if (!user.password_hash) {
      // Auto-created/unclaimed account — there's no password to reset. Silently
      // do nothing rather than reveal that distinction to whoever is asking.
      return res.json(genericResponse);
    }

    await sendPasswordResetEmail(user);
    res.json(genericResponse);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/reset-password', resetPasswordGuard.middleware, async (req, res) => {
  try {
    const token = String(req.body.token || '');
    const newPassword = String(req.body.newPassword || '');
    if (!token) return res.status(400).json({ error: 'Missing reset token.' });
    if (newPassword.length < 6) { resetPasswordGuard.recordFailure(req); return res.status(400).json({ error: 'Password should be at least 6 characters.' }); }

    const result = await pool.query('SELECT * FROM password_reset_tokens WHERE token = $1', [token]);
    if (result.rows.length === 0) { resetPasswordGuard.recordFailure(req); return res.status(400).json({ error: 'That reset link is invalid or has already been used.' }); }
    const record = result.rows[0];
    if (new Date(record.expires_at) < new Date()) {
      resetPasswordGuard.recordFailure(req);
      await pool.query('DELETE FROM password_reset_tokens WHERE id = $1', [record.id]);
      return res.status(400).json({ error: 'That reset link has expired — request a new one.' });
    }

    const hash = await hashPassword(newPassword);
    const updated = await pool.query(
      'UPDATE users SET password_hash = $1, auto_created = FALSE WHERE id = $2 RETURNING *',
      [hash, record.user_id]
    );
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [record.user_id]);

    const user = updated.rows[0];
    setAuthCookie(res, user); // sign them straight in, same as a fresh login
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.email_verified, verificationStatus: user.verification_status, verificationNote: user.verification_note } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong resetting your password.' });
  }
});

module.exports = router;
