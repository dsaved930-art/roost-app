const pool = require('../db');

// Everything that touches users.notify_new_messages lives in this file, on purpose. No shared or
// critical query (login, listings, messages, auth) names that column, so if it were ever missing
// from the database (a migration that didn't run), the worst outcome is these preference calls
// failing, never the site itself.

// Used right before sending a "new message" email. Fails OPEN: if the lookup errors for any reason,
// send the email like Roost always has. A missed notification costs a sale; an extra one costs nothing.
async function wantsMessageEmails(userId) {
  try {
    const result = await pool.query('SELECT notify_new_messages FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return true;
    return result.rows[0].notify_new_messages !== false;
  } catch (e) {
    console.error('Could not read notification preference, sending the email anyway:', e.message);
    return true;
  }
}

async function getNotificationPrefs(userId) {
  const result = await pool.query('SELECT notify_new_messages FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) return null;
  return { notifyNewMessages: result.rows[0].notify_new_messages !== false };
}

async function setMessageEmailPref(userId, value) {
  const result = await pool.query('UPDATE users SET notify_new_messages = $1 WHERE id = $2 RETURNING notify_new_messages', [value, userId]);
  if (result.rows.length === 0) return null;
  return { notifyNewMessages: result.rows[0].notify_new_messages !== false };
}

module.exports = { wantsMessageEmails, getNotificationPrefs, setMessageEmailPref };
