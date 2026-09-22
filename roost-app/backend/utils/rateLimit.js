// A tiny in-memory guard for sensitive endpoints (changing a password, deleting an account). Those
// endpoints ask for the current password, so a stolen login session could otherwise be used to guess
// it. Only WRONG-PASSWORD guesses count against the allowance; typos in other fields and successful
// changes don't, so a real person is never locked out for doing normal things.
//
// Roost runs as a single server process, so in-memory is enough. If it ever runs on several servers
// at once this should move to a shared store.
function makeGuard({ windowMs, maxFailures, keyOf }) {
  const failures = new Map(); // key -> { count, resetAt }
  keyOf = keyOf || (req => (req.user ? 'u' + req.user.id : 'ip' + req.ip));

  // Drop expired entries now and then so the map can't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
  }, windowMs).unref();

  return {
    // Express middleware: refuses the request once too many wrong guesses have piled up.
    middleware(req, res, next) {
      const entry = failures.get(keyOf(req));
      if (entry && entry.resetAt > Date.now() && entry.count >= maxFailures) {
        const minutes = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 60000));
        return res.status(429).json({ error: `Too many incorrect attempts. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.` });
      }
      next();
    },
    // Call when a wrong password was entered.
    recordFailure(req) {
      const key = keyOf(req); const now = Date.now();
      let entry = failures.get(key);
      if (!entry || entry.resetAt <= now) { entry = { count: 0, resetAt: now + windowMs }; failures.set(key, entry); }
      entry.count++;
    },
    // Same bookkeeping, named for guards that count every attempt rather than only failed ones
    // (e.g. signup, forgot-password — spamming those has a cost, like sending an email, even when
    // the request itself was perfectly valid).
    record(req) { this.recordFailure(req); },
    // Call after a correct password, so honest mistakes don't linger.
    reset(req) { failures.delete(keyOf(req)); }
  };
}

module.exports = { makeGuard };
