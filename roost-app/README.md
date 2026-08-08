# Roost

A real backend + frontend for the Roost bird marketplace prototype.

- `backend/` — Express + PostgreSQL API (auth, listings, moderation, stats)
- `frontend/public/` — the Roost UI, now calling the backend's API instead of
  browser-local storage

**Start here: [`backend/README.md`](backend/README.md)** — it has full setup
instructions, from running this on your own machine through deploying it live
with a real domain and (optionally) real "Continue with Google" sign-in.

Quick summary of what changed from the earlier prototype:
1. Real Postgres database instead of Claude-artifact storage
2. Passwords hashed with bcrypt server-side, sessions as signed JWT cookies
3. Admin access enforced by a `role` column checked on the server, not a
   client-side email list
4. Deployable to Render, Railway, or Fly.io with a real domain
5. The frontend now talks to this backend over HTTP instead of `window.storage`
