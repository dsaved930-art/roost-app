const bcrypt = require('bcryptjs');

// 12 rounds is a solid default in 2026 — strong enough to resist offline cracking,
// fast enough not to slow down real signups/logins.
const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { hashPassword, comparePassword };
