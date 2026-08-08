const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = ((profile.emails && profile.emails[0] && profile.emails[0].value) || '').toLowerCase();
      const name = profile.displayName || email;
      const googleId = profile.id;

      let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
      if (result.rows.length === 0 && email) {
        result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      }

      let user;
      if (result.rows.length > 0) {
        user = result.rows[0];
        if (!user.google_id) {
          const updated = await pool.query('UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *', [googleId, user.id]);
          user = updated.rows[0];
        }
      } else {
        const inserted = await pool.query(
          'INSERT INTO users (name, email, google_id, role, email_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING *',
          [name, email, googleId, 'user']
        );
        user = inserted.rows[0];
      }
      done(null, user);
    } catch (e) {
      done(e);
    }
  }));
}

module.exports = { passport, googleConfigured };
