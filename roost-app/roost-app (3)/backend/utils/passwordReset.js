const crypto = require('crypto');
const pool = require('../db');
const { sendMail } = require('./email');

const TOKEN_TTL_HOURS = 1; // short-lived on purpose — this token can set a new password

function publicUrl() {
  return process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function sendPasswordResetEmail(user) {
  // Clear out any old unused tokens first so only the newest link works.
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expiresAt]
  );

  const link = `${publicUrl()}/?resetToken=${token}`;
  return sendMail({
    to: user.email,
    subject: 'Reset your Roost password',
    text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your Roost password. Click this link to set a new one:\n${link}\n\nThis link expires in ${TOKEN_TTL_HOURS} hour. If you didn't request this, you can safely ignore this email — your password won't change.`,
    html: `<p>Hi ${user.name},</p><p>Someone (hopefully you) asked to reset your Roost password. Click below to set a new one:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${TOKEN_TTL_HOURS} hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>`
  });
}

module.exports = { sendPasswordResetEmail };
