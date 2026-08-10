# Roost backend

A real Express + PostgreSQL backend for Roost. This replaces the Claude-artifact
storage system entirely — passwords are hashed with bcrypt, sessions are signed
JWTs in httpOnly cookies, and the admin role is a column in the database checked
by the server on every sensitive request.

## What's here

```
backend/
  server.js            entry point
  db.js                Postgres connection pool
  schema.sql            table definitions
  migrate.js            run schema.sql against your database
  middleware/auth.js    cookie verification + requireAdmin
  routes/auth.js        signup, login, logout, /me, forgot/reset password
  routes/listings.js    browse, detail (gated contact info), create, report, admin queue/delete
  routes/stats.js       pageview counter + admin dashboard
  utils/passwords.js    bcrypt hashing
frontend/
  public/index.html     the Roost UI (same design as before)
  public/app.js          talks to the backend via fetch() instead of window.storage
```

## 1. Run it locally first

You'll want to confirm this works on your own machine before deploying anywhere.

1. Install [Node.js](https://nodejs.org) 18 or later, and get a Postgres database.
   The easiest way to get a free Postgres instance without installing anything
   locally is [Neon](https://neon.tech) or [Supabase](https://supabase.com) —
   both give you a `DATABASE_URL` connection string in under a minute.

2. In the `backend/` folder:
   ```
   npm install
   cp .env.example .env
   ```
   Open `.env` and fill in:
   - `DATABASE_URL` — from Neon/Supabase/wherever you got your database
   - `JWT_SECRET` — generate one with:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```

3. Create the tables:
   ```
   npm run migrate
   ```
   This runs `schema.sql` against your database. It's safe to re-run any time —
   `CREATE TABLE IF NOT EXISTS` won't touch tables that already exist, so if
   you're updating an existing deployment to add new tables (like the messaging
   feature), just run this again and only the new tables get created.

4. Start the server:
   ```
   npm start
   ```
   Visit `http://localhost:3000`. You should see Roost, now backed by a real database.

5. Make yourself an admin. Sign up for an account through the normal "Sign in"
   flow with your real email, then run this against your database (Neon/Supabase
   both have a SQL editor in their dashboard — paste this in):
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'dsaved930@gmail.com';
   ```
   Log out and back in. The "Moderation Queue" and "Site Stats" links will now
   appear in the footer, and only for you — this check happens on the server now,
   not in the page's JavaScript, so it can't be bypassed from the browser console
   the way the old prototype's version could.

## 2. Deploy it for real

**Recommended path: Render.** It's the least fiddly option for exactly this
shape of app (one Node service + one Postgres database), and has a free tier
for the database.

1. Push this whole project (`backend/` and `frontend/`) to a GitHub repository.

2. On [render.com](https://render.com):
   - **New → PostgreSQL** — create a database, note the "Internal Database URL" it gives you.
   - **New → Web Service** — connect your GitHub repo.
     - Root directory: `backend`
     - Build command: `npm install`
     - Start command: `npm start`
   - Under the web service's **Environment** tab, add:
     - `DATABASE_URL` = the connection string from the database you created
     - `JWT_SECRET` = a long random string (generate the same way as above)
     - `NODE_ENV` = `production`
   - Deploy. Render will give you a URL like `https://roost-xyz.onrender.com`.

3. Run the migration once against your production database. The simplest way:
   temporarily change the web service's start command to `npm run migrate && npm start`,
   deploy once, then change it back to just `npm start`. (Or run `npm run migrate`
   from your own machine with `DATABASE_URL` pointed at the production database.)

4. Make your admin account an admin in production the same way as step 5 above,
   using Render's database dashboard SQL console this time instead of Neon/Supabase's.

**Alternatives that work the same way:** Railway and Fly.io both support this
exact "Node service + Postgres" shape with a similar setup. Vercel is built
around serverless functions and static frontends — it *can* run this, but it's
a worse fit for a small always-on Express server with a database; Render/Railway
will be less friction.

## 3. Get a real domain (optional but recommended)

Buy a domain from any registrar (Namecheap, Google Domains successor Squarespace
Domains, Cloudflare Registrar). In Render's dashboard, under your web service's
**Settings → Custom Domains**, add your domain and follow the DNS instructions
it gives you (usually one CNAME record). Render handles HTTPS certificates
automatically once DNS is pointed correctly.

## Google Sign-In (removed)

Google Sign-In was built and briefly live, then removed after Google's Safe
Browsing flagged the deployed domain with "tries to trick visitors into
sharing personal info," and Render suspended the account shortly after.

The likely (not 100% certain) cause: a "Sign in with Google" button
redirecting to `accounts.google.com`, sitting on a randomly-generated free
subdomain (`something.onrender.com`), is structurally very close to what
real phishing kits look like to automated scanners — even though the OAuth
flow itself was implemented correctly and legitimately. The scanner can't
distinguish intent from that pattern alone.

All of it has been removed: the frontend button, the `/api/auth/google`,
`/api/auth/google/callback`, and `/api/auth/google-status` routes,
`passport-setup.js`, and the `passport`/`passport-google-oauth20`
dependencies from `package.json`. Email/password sign-up, sign-in, and
password reset are unaffected — those never touched Google at all.

If you want to bring this back later, the safer path is: get the app onto
your own custom domain first (not a shared `onrender.com`/`vercel.app`
address), then re-add Google Sign-In against that domain. A domain you
control and that's been live for a while carries a real trust history a
brand-new auto-generated subdomain doesn't have.

## In-app messaging

Buyers and sellers can now message each other without ever seeing each other's
contact info if they don't want to. Highlights:

- `conversations` and `messages` tables — one conversation per (listing, buyer) pair
- `POST /api/listings/:id/message` starts a new conversation from a listing
- `GET /api/conversations` lists a signed-in user's inbox, with unread counts
- `GET/POST /api/conversations/:id/messages` reads and replies to a thread —
  both endpoints check that the requester is actually a participant in that
  conversation before returning anything
- Unread badge in the header polls every 30 seconds — this is polling, not a
  live socket connection. Fine at small scale; if message volume grows, this
  is the first thing worth upgrading to WebSockets or Server-Sent Events.

## What this fixes from the prototype, specifically

- **Passwords**: bcrypt (12 rounds), server-side only. The old version hashed
  with SHA-256 in the browser — better than plaintext, but not real protection.
- **Admin access**: a `role` column in `users`, checked by `requireAdmin`
  middleware on every admin request. The old version was a hardcoded email list
  sitting in client-side JavaScript that anyone could read or bypass via devtools.
- **Contact info gating**: the server now decides whether to include contact
  details in the API response based on whether the request is authenticated —
  it's never sent to the browser at all for signed-out visitors, rather than
  being present in the page and just visually hidden.
- **Sessions**: signed JWTs in httpOnly cookies, verified server-side. Not
  readable or forgeable from browser JavaScript.

## Ratings & reviews

Buyers can rate and review a seller — but only after they've actually messaged
that seller about a specific listing. That's the closest proxy this app has to
"proof of a real interaction" without payment data to verify an actual sale,
and it keeps reviews from being open to anyone who's never talked to the seller.

- `reviews` table: one review per (listing, reviewer) pair, 1–5 stars plus an
  optional comment
- `POST /api/listings/:id/reviews` — checks a conversation exists first, then
  inserts (or rejects with a clear error if they've already reviewed this one)
- `GET /api/users/:id/profile` — public seller profile: average rating, review
  count, individual reviews, and their other active listings
- Listing detail view shows the seller's name (linking to their profile) and
  star rating inline
- The "Rate this seller" action lives in the message thread itself, once
  there's a real conversation to review from

## Saved searches & alerts

Signed-in users can save the filters they've got set on Browse (category,
keyword, price range, location) and get notified when a new listing matches —
both in-app and by real email, if you set up SMTP.

- `saved_searches` / `saved_search_matches` tables
- Matching runs the moment a new listing is posted (`services/alerts.js`),
  using the exact same match logic as the frontend's filter panel, so a saved
  search behaves like "the filters you had on when you saved it"
- The bell icon in the header shows an unread badge and opens a panel with
  your saved searches (with a per-search email on/off toggle and delete) plus
  a feed of recent matches
- **Email requires SMTP setup** — until you configure it, saved searches and
  the in-app notification feed work fully, emails are just silently skipped
  (you'll see a log line noting each skipped send). To turn emails on:
  1. Get SMTP credentials from any provider — SendGrid, Mailgun, Postmark,
     and AWS SES all offer an SMTP interface, and most have a free tier
     that's more than enough to start.
  2. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `FROM_EMAIL`
     in your environment variables.
  3. Redeploy. No code changes needed — `utils/email.js` picks these up automatically.

## Verified breeder badges

Two separate trust signals, both real:

**Email verification** — automatic. Signup sends a confirmation link (via the
same SMTP setup as saved-search alerts). Until it's clicked, the account's
"Your account" panel shows an "email not verified" warning with a resend
button.

**Verified breeder status** — manual, admin-reviewed, since there's no paid
identity-verification API wired in here (Stripe Identity, Persona, etc. would
be the next step up if you want that later). A user applies from their
account panel with a business/breeder name, phone number, and an optional
supporting document (license, health certificate — anything, uploaded as a
photo the same way listing photos work). It shows up in the admin-only
**Verification Requests** panel (footer link, same visibility pattern as the
Moderation Queue), where an admin approves or rejects with a note. Approved
accounts get a blue checkmark badge everywhere their name appears — listing
cards, listing detail, and their seller profile.

Rejected applicants see the reviewer's note and can update their details and
reapply — nothing is a dead end.

## Seller analytics ("My Listings")

Real proof-of-value for sellers, not vague reassurance. A new "My Listings"
tab (visible once signed in) shows every listing you've posted with three
real numbers attached:

- **Views** — `listings.view_count`, incremented once per real page load of
  the listing (see `GET /api/listings/:id`). Crawlers/bots don't bump this,
  since it only increments through the same API call a real browser makes
  once the page's JavaScript runs — a bot that never executes JS won't count.
- **Buyers messaged** — a live `COUNT(DISTINCT buyer_id)` against the
  `conversations` table for that listing.
- **Saved-search alerts sent** — a `COUNT` against `saved_search_matches` for
  that listing, i.e. how many people's saved searches this listing triggered.

`GET /api/listings/mine` computes all of this per-listing in one query.
Note it's registered *before* `GET /api/listings/:id` in `routes/listings.js`
— Express matches routes in the order they're registered, so `/mine` has to
come first or Express would try to treat "mine" as an `:id` value.

## Tools for repeat sellers

Two additions on top of "My Listings" from the previous round:

- **Sellers can now delete their own listings.** Previously only admins could
  remove a listing at all — a regular seller had no way to take down their
  own post. `DELETE /api/listings/:id` checks `posted_by` against the
  requester server-side before allowing it; this is separate from the
  admin-only `DELETE /api/listings/admin/:id` used for moderation.
- **Duplicate a listing.** A "Duplicate" button on each item in My Listings
  pre-fills the post form — title, category, breed, price, location,
  description, contact info, even the photo — from an existing listing.
  Deliberately does *not* pre-check the captive-bred/ownership or 18+/ToS
  attestations; re-confirming those each time is the point, not something to
  skip past. This is the main lever for a breeder relisting similar birds, or
  posting a whole clutch one at a time, without retyping everything.

## Mark as sold, and a "Recently Sold" feed

Two connected pieces:

- **Mark as sold / mark available again** — a toggle button on each listing
  in My Listings. `PATCH /api/listings/:id` (owner-only, checked against
  `posted_by` server-side) sets `sold = TRUE` and `sold_at = now()`, or
  reverses it. Sold listings are automatically excluded from the main browse
  feed (`GET /api/listings/` now filters `WHERE sold = FALSE`) so buyers
  aren't wading through unavailable birds — the listing itself still exists
  and its detail page still works, it's just not in the default browse list.
- **"Recently sold" strip on the Browse page** — real social proof, shown to
  every visitor, not buried behind a link. `GET /api/listings/sold` is a
  public endpoint returning the 12 most recently sold listings; the strip
  hides itself entirely if there's nothing to show yet, rather than
  displaying an awkward empty state.

Both `GET /sold` and `GET /mine` are registered before `GET /:id` in
`routes/listings.js` for the same routing reason noted elsewhere in this
file — Express matches path segments in registration order, so a literal
word like `sold` would otherwise get swallowed by the `:id` wildcard.

## Security & stability audit

A full pass looking specifically for crash risks and security bugs, done
after the feature list above was complete. Two real issues were found and
fixed — not stylistic nitpicks, both were things that would have caused
real problems in production:

- **Stored XSS in the SEO listing page.** The JSON-LD structured data block
  in `seo.js` embedded a listing's description directly into an HTML
  `<script>` tag using raw `JSON.stringify()`. Since descriptions are
  seller-controlled text, one containing `</script><script>...</script>`
  could break out of the JSON block and run arbitrary JavaScript for anyone
  who visited that listing's page — including Google's crawler. Fixed by
  escaping `<` characters (`.replace(/</g, '\\u003c')`) before embedding;
  verified the fix blocks the breakout while still producing valid JSON.
- **16 of 39 async route handlers had no try/catch.** This app runs on
  Node 18+, which terminates the entire process on an unhandled promise
  rejection (default behavior since Node 15) — not just fails one request.
  A single database hiccup (dropped connection, timeout, pool exhaustion)
  hitting any of those 16 routes could have taken the whole site down for
  every user at once. All 16 are now wrapped, across `auth.js`,
  `listings.js`, `messages.js`, `savedSearches.js`, `stats.js`, and
  `verification.js`. `POST /stats/pageview` was the highest-risk of these
  specifically, since it's hit on every single page load by every visitor.

Also checked and confirmed clean, worth knowing were checked rather than
assumed: every module's exports match every file that imports them; all 79
SQL queries have matching placeholder/parameter counts; route registration
order was checked per-HTTP-method across every route file (a few looked
risky at a glance but weren't); every `req.user` access is behind
`requireAuth` or a null-guard; all user content is properly escaped before
HTML insertion on both the SPA and the server-rendered SEO page (the JSON-LD
case above was the one real gap); and Postgres returning `NUMERIC` columns
as strings (a classic `pg` driver gotcha) never actually causes a bug here,
since every use of `price` is either an operator that coerces types
correctly or a display context using string concatenation.

## "Just listed" badge and share links

Two small, frontend-only additions — no schema changes, since both use data
that already existed.

- **"Just listed" badge** shows on a listing's photo (both the browse card
  and the full listing page) for the first 24 hours after posting, the same
  pattern Facebook Marketplace uses. Purely a client-side time comparison
  against `createdAt` — no new tracking needed. Also added to the
  server-rendered SEO page in `seo.js` for consistency.
- **Share button** on the full listing page uses the native Web Share API
  where available (mobile browsers mostly — brings up the OS share sheet),
  and falls back to copying the link to the clipboard with a toast
  confirmation everywhere else, with a `window.prompt` as a last-resort
  fallback for very old browsers that support neither API.

One implementation detail worth knowing: both badges are placed in a
separate wrapper (`.thumb-img-wrap`) around the photo `<img>` rather than
directly inside the same container the badge lives in. That's deliberate —
the image has an `onerror` handler that replaces its container's content
with a fallback icon if the photo fails to load, and without the extra
wrapper, that would have wiped out the badge along with the broken image.

## Multiple photos per listing (up to 5)

Sellers can now upload up to 5 photos instead of exactly 1. A few things
worth knowing about how this was built:

- **The upload/browse-grid tradeoff from earlier is preserved.** Adding more
  photos to a listing does NOT make browsing more expensive — `listings`
  still caches photo #1 as `photo_thumb`/`photo_full` (unchanged columns),
  which is all any card/grid view ever needed. The other photos live in a
  new `listing_photos` table that's only queried when someone opens a
  specific listing's detail page. Browsing 100 listings still only pulls
  100 cover photos, not up to 500.
- **Real EXIF orientation bug fixed while building this.** Phone cameras
  often store rotation as metadata rather than physically rotating pixel
  data — a plain `<img>` respects that automatically, but drawing onto a
  canvas (which is how photos get compressed before upload) does not. This
  means a portrait photo from an iPhone could have come out sideways after
  compression. Fixed using `createImageBitmap(file, {imageOrientation:
  'from-image'})`, which bakes the correct rotation into the pixel data
  itself, with a fallback to the old approach for older browsers that
  don't support the option.
- **5 is enforced server-side**, not just hidden in the UI — `POST /api/listings`
  slices any submitted photo array down to 5 regardless of what's sent, so
  someone bypassing the browser and calling the API directly can't post more.
- The full listing page shows a gallery: a main photo plus a thumbnail strip
  when there's more than one, using the same `object-fit: cover` technique
  as the cards so mixed portrait/landscape photos display consistently
  without looking stretched or oddly cropped.
- `seo.js`'s JSON-LD structured data now lists all of a listing's photos
  (schema.org's `image` field accepts an array), while the Open Graph image
  used for link previews stays the single cover photo — correct behavior
  for each: rich results benefit from more images, but a link preview should
  show one clear photo, not try to cram several in.

## Post-launch fixes (first round of real usage)

Several changes made after the first live deploy, based on real testing:

- **Sign-in is now required before posting**, full stop. The old "anyone can
  post, we'll auto-create an account behind the scenes" behavior is gone —
  `POST /api/listings` now requires `requireAuth`, and the frontend gates the
  "Post a bird" tab behind sign-in. This was the root cause of a cluster of
  confusing behavior: listings with no linked account (breaking the message
  button with "this listing doesn't have a linked account to message"),
  listings ending up attributed to the wrong account, and generally unclear
  logged-in state. Listings created before this change may still be orphaned
  (`posted_by IS NULL`) and unmessageable — there's no safe way to retroactively
  guess whose account they belong to, so any left over from testing should be
  deleted and reposted.
- **`breed` and `posterName` are no longer required** to publish a listing.
  `posterName` defaults to the signed-in account's name if left blank.
- Required-field asterisks added to the post form, matching the above.
- Removed the "Load 3 sample listings" dev/demo button and its code —  no
  longer appropriate once real listings exist.
- Added a favicon (the feather mark from the logo, as an SVG).

## Forgot password

A real "Forgot password?" flow, using the same SMTP setup as email
verification and saved-search alerts.

- `POST /api/auth/forgot-password` — always returns the same generic
  response regardless of whether the email exists, specifically so this
  endpoint can't be used to check which email addresses have Roost accounts.
  Only actually sends an email if a matching account with a real password
  exists (auto-created/unclaimed accounts are silently skipped, same reasoning).
- The reset link is short-lived (1 hour) and single-use — any old unused
  tokens for that account are deleted before a new one is issued.
- `POST /api/auth/reset-password` verifies the token, sets the new password,
  and signs the person straight in — same as a normal login. It also marks
  the account as claimed (`auto_created = FALSE`), so this doubles as another
  path to claim an account that was auto-created before this account model
  changed, on top of the existing signup-with-same-email path.
- The reset link points at `/?resetToken=...`; the frontend detects that
  query param at boot, opens the auth modal straight into a "set new
  password" screen, and cleans the token out of the URL afterward so it's
  not left sitting in the browser history.

## Real distance ("X miles away")

Uses the US Census Bureau's geocoding API — free, no API key, no credit
card, no spending cap to worry about. Chosen deliberately over Google Maps'
Geocoding API for that reason, even though Google's is generally more
accurate: Google requires a credit card on file even for free-tier usage,
and has no default hard spending cap if traffic spikes unexpectedly.

**The honest tradeoff:** the Census API is built primarily for full street
addresses — it interpolates a point along a known address range — not bare
"City, State" queries. It works well for many US cities, but won't find a
match for every one. When it can't:

- A listing's `lat`/`lon` just stay `NULL` (set via a best-effort geocode
  right after the listing is created — this never blocks or slows down
  posting, since it happens after the response is already sent).
- Filtering by location falls back to the original city/state text match,
  exactly like before this feature existed.
- Nothing errors or breaks either way — every distance calculation checks
  for real coordinates on both sides first, and only computes/shows a
  distance when both are present.

`utils/geocode.js` has both the geocoding call and the Haversine distance
formula (verified against known real-world distances — NYC to LA computes
to ~2,446 miles, matching the standard cited great-circle flight distance).
The same formula is duplicated client-side in `app.js` so distance can be
computed instantly while filtering, without a round-trip per listing.

If this turns out to have a lower match rate than you'd like once it's
live with real city names, switching to a different free geocoder (or
biting the bullet on Google's card requirement) is a contained change —
only `utils/geocode.js` would need to change, not the calling code.

## Structured listing details (Phase 1 of the "competitive features" plan)

Two new fields, seller-set at posting time, shown as scannable icon rows on
the listing page rather than buried in free-text descriptions — directly
motivated by real competitor research: "DNA sexed" was the single most
repeated phrase across real listings on the biggest existing bird classifieds
site, and it was always just typed into a paragraph, never structured.

- **DNA sexed** and **Hand-tame** — each a tri-state field (`yes` / `no` /
  `unknown`), stored as `TEXT` with a `CHECK` constraint rather than a plain
  boolean, specifically to represent "seller didn't say" as a real, honest
  state rather than defaulting silently to "no." Enforced both in the
  dropdown (defaults to "? Not sure") and server-side — an unrecognized value
  submitted directly to the API falls back to `'unknown'` rather than erroring
  or being trusted as-is.
- Displayed alongside the existing **Gender** (the `sex` field) and **Age**
  fields in a single "Details" block, using small colored ✓ / ✕ / ? badges —
  green for yes, red for no, gray for unspecified.
- Deliberately **not shown on browse cards** — keeping cards fast to scan
  (the FB Marketplace / Craigslist "glance in a few seconds" feel) was an
  explicit design goal; the full details only show once someone's actually
  interested enough to open a listing.
- The description field is untouched — still free text, still where a
  seller's personality and story live. This is additive structure, not a
  replacement for it.
- Shown identically on both the interactive listing page and the
  server-rendered SEO version, so search engines and link previews see the
  same structured facts a real visitor does.

## Phase 2: Shipping toggle + pending/sold status

- **Shipping available** — a checkbox on the post form, shown in the same
  structured Details block as the Phase 1 fields (DNA sexed, Hand-tame).
- **Listing status is now 3-state**, not a boolean: `active`, `pending`
  (deposit received, not sold yet), or `sold`. This replaced the old `sold`
  boolean as the source of truth via a new `status` column — the old
  `sold`/`sold_at` columns are kept in sync on every write as a safety net,
  not fully removed.
- **The migration backfills existing data**: any listing already marked
  `sold = TRUE` under the old model gets `status = 'sold'` automatically the
  first time this runs.
- **Pending listings stay visible in browse** (unlike sold, which is
  filtered out) — with a "PENDING" banner on cards and a badge on the full
  listing page, since a deal in progress is still real information worth
  other buyers seeing.
- **My Listings** has a 3-option status dropdown per listing instead of a
  single toggle button.
- `PATCH /api/listings/:id` now takes `{status: 'active'|'pending'|'sold'}`
  — sending the old `{sold: boolean}` shape is rejected with a 400, not
  silently misinterpreted.

## Posting-time clarity + clickable logo

- **Replaced the old "Just Listed" badge** (which only appeared for the
  first 24 hours) with an always-visible small clock-icon chip showing how
  long ago a listing was posted — "3h", "2d", "3w", "5mo" — on both cards
  and the full listing page. This directly fixes a real ambiguity: the
  bird's own age (e.g. "8 months") sat right next to the listing in a way
  that could be misread as "posted 8 months ago." Posting time now has its
  own clearly-iconified, always-present indicator, completely separate from
  the bird's age field.
- **The logo and "Roost" wordmark in the header are now a real link** back
  to the homepage — clicking navigates within the app (no full page
  reload) unless a modifier key is held, in which case it behaves like a
  normal link (opens in a new tab, etc).

## Header subtitle

Settled on "A marketplace for bird lovers" — references the people, not
just the transaction, and reads a bit warmer than a flat description. Not
locked to a specific species-count language, so it won't need revisiting
purely because of the eventual multi-species expansion (though "bird" will
obviously need to change whenever that actually happens).

## Phone formatting, cleaner Details block, white background

- **Phone numbers display formatted** (`209-954-6556` instead of the raw
  digits), regardless of how they were originally entered — handles plain
  digits, parens, spaces, and an optional leading "1" country code, and
  falls back to showing the raw value untouched for anything that isn't a
  recognizable 10 or 11-digit US number, rather than mangling it. Also
  auto-formats on the post form when a seller tabs away from the field.
- **A "Call" button now sits next to a phone contact**, using a real `tel:`
  link — only shown for phone contacts, never for email.
- **Removed the duplicate age** from the subtitle line under a listing's
  title (it's still shown properly in the Details block below — this was
  just removing a confusing duplicate, not removing the information).
- **Simplified the Details block** to match Petfinder's cleaner look: no
  more grey box border around the whole section, and no more colored
  ✓/✕/? icon circle before each field — just the emoji, the label, and a
  plain "Yes" / "No" / "Not specified".
- **Page background changed to white**, matching the header. Deliberately
  changed only `body`'s specific background rule, not the shared
  `--canvas` CSS variable itself — that variable is still used correctly
  in ~20 other places (thumbnail placeholders, stat cards, etc.) that
  intentionally want a neutral grey for contrast against white cards.
  Removed the header's bottom border to match the flatter look.
- **"Recently Sold" cards are about 25% bigger** — closer to Facebook
  Marketplace's scale, without going all the way there.

## What's still not done

This backend is functionally real, but production-hardening it further would include:
- Rate limiting on login/signup (to slow down brute-force attempts)
- Email verification before an account is considered fully active
- A password reset flow (currently there isn't one)
- Moving uploaded photos to real object storage (S3, Cloudflare R2, etc.) instead
  of storing base64 image data directly in Postgres — fine at small scale, but
  will bloat your database as listings grow
- Structured logging / error monitoring (e.g., Sentry)
- Automated backups of the database (most managed Postgres providers do this
  for you, but confirm your plan includes it)
- Saved-search matching currently runs inline, checking every saved search
  against every new listing at post time. Fine for hundreds or low thousands
  of saved searches; if that grows much larger, move it to a background job
  queue (e.g., BullMQ with Redis) so a busy moment doesn't slow down posting.
