# Roost

A real backend + frontend for the Roost bird marketplace prototype.

- `backend/` — Express + PostgreSQL API (auth, listings, moderation, stats)
- `backend/public/` — the Roost UI. This lives *inside* `backend/`, not next
  to it, on purpose — some hosting platforms (DigitalOcean App Platform,
  notably) restrict a deployed app's files to whatever's inside the
  configured "source directory," so keeping the frontend as a sibling folder
  outside `backend/` caused it to go missing entirely on that platform. This
  structure works correctly everywhere.

**Start here: [`backend/README.md`](backend/README.md)** — it has full setup
instructions, from running this on your own machine through deploying it live
with a real domain.

Quick summary of what changed from the earlier prototype:
1. Real Postgres database instead of Claude-artifact storage
2. Passwords hashed with bcrypt server-side, sessions as signed JWT cookies
3. Admin access enforced by a `role` column checked on the server, not a
   client-side email list
4. Deployable to Render, Railway, Fly.io, or DigitalOcean App Platform with a real domain
5. The frontend now talks to this backend over HTTP instead of `window.storage`
