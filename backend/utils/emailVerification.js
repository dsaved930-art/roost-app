const crypto = require('crypto');
const pool = require('../db');
const { sendMail } = require('./email');

const TOKEN_TTL_HOURS = 48;

function publicUrl() {
  return process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function sendVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expiresAt]
  );

  const link = `${publicUrl()}/api/auth/verify-email?token=${token}`;
  return sendMail({
    to: user.email,
    subject: 'Confirm your email for Roost',
    text: `Hi ${user.name},\n\nConfirm your email address to finish setting up your Roost account:\n${link}\n\nThis link expires in ${TOKEN_TTL_HOURS} hours.`,
    html: `<p>Hi ${user.name},</p><p>Confirm your email address to finish setting up your Roost account:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${TOKEN_TTL_HOURS} hours.</p>`
  });
}

module.exports = { sendVerificationEmail };
