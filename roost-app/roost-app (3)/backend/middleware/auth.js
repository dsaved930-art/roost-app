const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'roost_token';
const TOKEN_EXPIRY = '30d';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function setAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                                   // JS in the browser can never read this cookie
    secure: process.env.NODE_ENV === 'production',     // HTTPS-only in production
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Attaches req.user if a valid token cookie is present. Never blocks the request —
// routes that require login check req.user themselves; routes that require admin
// use requireAdmin below.
function authOptional(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  req.user = null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      req.user = null; // expired or tampered token — treat as logged out
    }
  }
  next();
}

// This is the actual security boundary that the old client-side ADMIN_EMAILS
// array never provided: the SERVER checks the role on every request, using a
// signed token it issued itself. A visitor can't fake this from the browser
// console the way they could with a hardcoded JS array.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// For routes that need any signed-in user (e.g. messaging) — not just admins.
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in first.' });
  }
  next();
}

module.exports = { setAuthCookie, clearAuthCookie, authOptional, requireAdmin, requireAuth, COOKIE_NAME };
