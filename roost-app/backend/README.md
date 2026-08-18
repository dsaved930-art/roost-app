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

## Expanded Site Stats

Real data the app already had, just not surfaced yet — no new tracking,
no third-party tool, everything computed directly from existing tables.

- **Growth, last 8 weeks** — new listings and new signups per week, as
  small bar charts, so you can actually see if outreach is working rather
  than staring at one cumulative number.
- **Where listings are coming from** — top cities/states by listing count.
  Directly useful for the "prove one region dense before expanding"
  strategy — shows exactly where there's already real density vs. where
  it's thin.
- **By category** — which bird communities are actually posting.
- **Engagement funnel** — total listing views, total buyer-seller
  conversations started, and the percentage of views that turned into a
  message. This is the real "is it working" number, not just traffic.
- **Average days to sell**, verified breeder count, and how many buyers
  have at least one saved search — smaller signals, still real.

The honest boundary, worth remembering: this can only ever show what the
app's own database already captures. It has no idea which page someone
came from, whether they're a repeat visitor, or their device/location —
that requires an actual visitor-tracking tool (Google Analytics, Plausible,
etc.), not something to try to rebuild here.

## Editable listings

Sellers can now fix a typo or change the price without deleting and
reposting. An "Edit" button in My Listings opens the same post form,
pre-filled — same UI as Duplicate, but it updates the existing listing
(`PUT /api/listings/:id`) instead of creating a new one.

- Ownership checked server-side the same way as delete/status-update — an
  edit request for someone else's listing (or an orphaned listing with no
  owner) is rejected with a 403, not silently allowed.
- Editing doesn't require re-confirming the captive-bred/18+ attestation
  checkboxes — those were already confirmed when the listing was first
  created, and re-requiring them on every price fix would just be friction.
  Both the frontend and backend skip that check specifically for edits.
- Photos are fully replaced on save, not diffed — the frontend always
  sends the complete current photo set (via the same multi-photo UI used
  for creating a listing), so the backend just clears the old
  `listing_photos` rows and inserts the new set. Simpler and correct.
- City/state changes trigger a best-effort re-geocode, same as on creation,
  so a listing's map coordinates (used for the real-distance search) stay
  accurate if someone corrects their location.
- Real bug caught and fixed while building this: if someone started editing,
  navigated away without saving, then clicked "Post a bird" to start a
  *new* listing, the form would still silently be in edit mode — meaning
  submitting what looked like a fresh post could have overwritten their
  other listing instead. Fixed by clearing edit-mode state whenever the
  post form is entered via the main "Post a bird" tab specifically (an
  in-progress *new* post draft is still preserved if you just navigate away
  and back — only the specific stale-edit case is reset).

## Removed the homepage subtitle paragraph

The "Listings only — Roost doesn't handle payments..." line under the hero
heading was removed for a cleaner homepage. The same safety message still
appears on every individual listing page, right where a transaction
actually happens — nothing was lost, just de-duplicated.

## Browse page redesign — Facebook Marketplace-style sidebar

The old top search bar + dropdown filter panel is gone, replaced with a
left sidebar (search, quick "Post a bird" button, location, categories as
a vertical list, sort, price range, trade toggle, save-search) — plus
borderless cards with a hover-only shadow, matching the reference look.

- **Mobile handling was the real design problem here, not an afterthought.**
  A persistent sidebar doesn't fit a phone screen. Rather than build two
  separate UIs, there's exactly one set of filter elements (same IDs, same
  JS) that CSS repositions: a sticky column on screens ≥900px wide, or an
  off-canvas slide-in drawer (triggered by a "Filters" button, closed via
  an explicit close button, a backdrop tap, or clicking outside it) below
  that width. No duplicated elements to keep in sync, no risk of the two
  versions drifting apart over time.
- **The header is now sticky too**, so it and the sidebar both stay visible
  together while scrolling through listings — matching the "frozen"
  behavior asked for.
- **Categories switched from horizontal chips to a vertical list**, which
  is the only categories layout that actually makes sense in a narrow
  sidebar column — same underlying data and click handling, just restyled.
- **"Recently Sold" was deliberately left out of this pass** (explicit
  call, not an oversight) — the container was removed from the page, and
  `loadRecentlySold()` now checks the container exists before doing
  anything, so it's a clean no-op rather than an error. Nothing about the
  underlying feature (the backend route, the data, the styling) was
  deleted — it can come back by just re-adding the container markup.
- **A real bug caught while wiring this up**: the location text span's
  truncation CSS was accidentally written as a class selector
  (`.location-indicator-text`) against an element that only has an `id`
  (`#location-indicator-text`) — meaning it silently would have never
  applied. Caught by re-checking the actual HTML against the CSS rather
  than assuming, and fixed before shipping.

## Photo cropping, location modal, sidebar polish

Four real, diagnosable bugs from the sidebar redesign, not guesses:

- **Heads/feet getting cropped off in photos, worst on card thumbnails.**
  Root cause: `.thumb` used a fixed `height:150px` with a variable
  (much wider) width. `object-fit: cover` scales an image up until it
  fully covers its box, then crops the overflow evenly from both sides —
  for a typical tall/portrait phone photo forced into a short, wide box,
  that means cropping a lot off both the top *and* bottom equally, which
  is exactly "head cropped, feet cropped." Fixed by switching `.thumb` to
  a `4:3` `aspect-ratio` instead of a fixed height — much closer to how
  phones actually frame photos, so there's far less to crop away. This
  also made thumbnails noticeably taller/bigger as a natural side effect,
  which covers the "make images a little bigger" ask too — bumped the
  grid's minimum card width slightly as well.
- **Location popup's top covered by the header.** The header became
  `position: sticky` in the redesign with `z-index: 60`, but the modal
  overlay was still `z-index: 50` — lower, so the sticky header rendered
  on top of it. Fixed by raising the overlay's z-index well above both the
  header and the mobile filter drawer (which is `z-index: 100` — a modal
  opened *from inside* the mobile drawer needed to clear that too, not
  just the header, which wouldn't have been obvious from the desktop
  screenshot alone).
- **Sidebar scrollbar overlapping buttons, oval buttons looking clipped.**
  The desktop sidebar's padding was accidentally set to `0` in the
  redesign (an oversight, not intentional) — meaning every button
  stretched edge-to-edge with zero breathing room, so their rounded
  corners rendered right at the sidebar's exact boundary. Restored real
  padding, and added `scrollbar-gutter: stable` so the scrollbar always
  reserves its own space rather than overlapping content when it appears.

## Photo cropping — the actual fix (previous round was analysis only)

Implemented what was discussed and approved: the detail-page fix plus
squarer thumbnails, with the manual crop-adjustment tool intentionally
left for later.

- **Main listing photo no longer crops at all.** Switched from
  `object-fit: cover` (crop to fill) to `object-fit: contain` (show the
  whole image, letterboxed if needed) specifically on the detail page's
  main photo — there's no reason to ever hide part of a photo on the one
  view where someone's deciding whether to buy. The container needed an
  explicit `height` (not just `max-height`) for this to render reliably;
  the neutral canvas-grey background shows through as letterboxing on
  photos that don't perfectly fill the box, rather than harsh black bars.
- **Grid card thumbnails pushed from 4:3 to a full square (1:1).** These
  intentionally still crop-to-fill (needed to keep the uniform grid look),
  but a square box is a much closer match to how phones actually frame
  photos than the previous short rectangle was, so meaningfully less gets
  cropped away by default — without adding any new UI or asking sellers
  to do anything.
- **The manual crop-adjustment tool (letting a seller pick exactly what
  shows) is a real, separate feature, deliberately not built this round** —
  it's genuine new UI work, not a CSS tweak, and the two fixes above cover
  the bulk of the actual problem on their own.

## New-message email notifications

The single most important gap between "feels like a real, responsive
marketplace" and "buyer messages, seller never notices, sale is lost."
Uses the same SMTP setup already wired up for password reset and
saved-search alerts — no new external service.

- Fires from **both** places a message can be created: starting a new
  conversation (`POST /api/listings/:id/message`) and replying within an
  existing one (`POST /api/conversations/:id/messages`). Notifies
  whichever party did *not* send the message — a buyer's first message
  notifies the seller, a seller's reply notifies the buyer, and so on.
  Tested both directions explicitly, not just one.
- Always fires *after* responding to the sender, fire-and-forget — a slow
  or failed email can never hold up or break sending the actual message.
- **The email link deep-links straight into the specific conversation**
  (`/?conversation=<id>`), not just "go check your Messages tab." A real
  bug caught before shipping: the redirect handler checks `currentUser` to
  decide whether to prompt sign-in first, but it was originally wired to
  run before `refreshCurrentUser()` had resolved — meaning an
  already-logged-in person clicking the link could have been wrongly
  prompted to sign in again. Fixed by chaining it after that check
  actually completes, the same pattern already used for the email
  verification redirect.
- **Message content is HTML-escaped before going into the email**, same
  discipline as the JSON-LD fix from earlier — a message body containing
  something like `</blockquote><script>...` is neutralized before it ever
  reaches the email template, not just displayed safely on the site.
- Message previews are truncated to 200 characters in the email — enough
  to see what it's about, not the whole thing, both for a cleaner email
  and as a reason to actually click through to the site.

## Header alignment fix

The logo drifted away from the left edge on wide screens — a leftover
from the sidebar redesign. The header still had its old `max-width: 1080px`
centered-container styling from before that redesign, while the browse
page's own content grew to a wider, edge-to-edge layout — so on a wide
screen, the two no longer lined up. Removed the header's width constraint
entirely so it's flush against the edges again, consistent with the rest
of the page.

## City/state autocomplete (optional — requires your own Google API key)

As you type a city on the post form, real address suggestions appear
(Google Places), and selecting one fills in both city and state
automatically. **Entirely optional and off by default** — if no API key
is configured, the fields just work as plain text entry, exactly like
before. Nothing else about the app depends on this.

### Setup (you'll need to do this part yourself — I can't create Google
### accounts or API keys on your behalf)

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create
   a project if you don't have one already.
2. Enable two APIs: **"Maps JavaScript API"** and **"Places API"** (the
   widget needs both).
3. Enable billing on the project — Google requires this even to use the
   free tier, but see step 5 below for a real safety net, not just trust.
4. Create an API key (APIs & Services → Credentials → Create Credentials
   → API Key).
5. **Restrict the key — this step matters, don't skip it:**
   - Application restriction → HTTP referrers → add
     `https://roostmarketplace.com/*`
   - API restriction → limit it to just the two APIs from step 2
   - Then go to IAM & Admin → Quotas, find the Maps JavaScript/Places
     quotas, and set a hard cap comfortably below the free monthly tier.
     This is the real safety net: if usage ever unexpectedly spiked, the
     feature would simply stop suggesting addresses (falling back to
     plain typing) rather than silently charge your card.
6. Add the key as an environment variable in DigitalOcean:
   `GOOGLE_PLACES_API_KEY` = your key. Redeploy.

### How the cost actually works, if you're wondering whether to bother

The autocomplete typing itself is free when a "session" completes
normally (someone types, then clicks a suggestion) — Google only bills
when that session terminates with a details lookup. The realistic risk
is a session that gets abandoned (someone types but never selects
anything), which can revert to per-keystroke billing. At Roost's current
traffic this is very unlikely to ever generate a real charge — the free
tier is sized for thousands of monthly lookups — but the quota cap in
step 5 exists specifically so that stays true regardless of how usage
actually plays out.

### Implementation notes

- Backend: a new `GET /api/config` endpoint serves the key to the
  frontend. This is normal and expected for this kind of key — the key is
  fundamentally client-side/embedded in the browser, so it's secured by
  the domain + API restrictions above, not by hiding it.
- Frontend: only loads Google's script at all if a key is configured,
  and only wires up the widget once that script finishes loading — a
  missing or slow-to-load key degrades gracefully to plain text, never
  breaks the form.
- Address parsing was tested against realistic response shapes, including
  smaller towns that only return a `sublocality` rather than a
  `locality`, and a malformed/missing-state response — neither crashes or
  leaves the fields in a broken state.
- Added a CSS override for Google's autocomplete dropdown — it renders
  outside the app's normal layout with its own default z-index, which
  would otherwise get hidden behind the sticky header or the post form's
  containers.

## Autocomplete extended to "Change location" search too

Same suggestions-as-you-type widget now also attached to the location
filter's search field, confirmed live and working (real Google
suggestions, correctly badged "powered by Google").

Deliberately minimal, on purpose: this field already had its own working
distance-search system (Census Bureau geocoding, triggered by the "Use
this location" button). Rather than touch that working system, the
autocomplete widget is attached with no custom selection-handling code at
all — Google's widget already overwrites the input's text with whatever
suggestion gets picked by default, and the existing button just reads
whatever text is sitting in that field either way. So the typing
experience improved without changing, or risking, anything about how
location search actually resolves coordinates underneath it.

## Radius slider — actually responsive now, not stale

The 5-option dropdown became a real slider (1-100 miles, matching the
Facebook Marketplace reference), and the real bug behind "the map looks
stale" is fixed: the circle graphic previously only had its *text label*
change when you picked a different radius — the actual circle shape was
hardcoded and never resized. Now it visually grows and shrinks live while
dragging, using a sqrt-based scale (not straight linear) so smaller
distances — where most real usage concentrates — stay visually
distinguishable from each other instead of all looking like the same tiny
dot. Everything stays in miles throughout, as asked. Zero backend changes
needed — the distance-filtering logic already accepted any numeric
radius, not just the 5 preset values, so the slider works with what was
already there.

**Worth flagging separately, not built this round:** whether "similar to
Facebook Marketplace" also meant an actual live interactive map (real
streets, real geography) rather than this stylized circle — that's a
genuinely bigger, separate feature (Google's Maps *rendering* API, not
the Places API already in use, with its own cost/quota profile) worth a
deliberate decision rather than assuming either way.

## Real regression from the autocomplete rollout, found and fixed

Reported as "0 listings even at 99mi from Lodi" despite real nearby
listings existing — this was a genuine bug I introduced adding
autocomplete to the location search field, not a pre-existing issue.

**Root cause:** Google's autocomplete widget fills the field as
`"Lodi, CA, USA"` — three comma-separated parts — but the geocoding
endpoint's parser was written assuming exactly two (`"City, State"`) and
took the *last* comma-separated piece as the state. That meant it was
sending `state="USA"` instead of `state="CA"`, which obviously can't
geocode — and the fallback text-matching path was equally broken, since
it does an exact substring match against the *whole* search string,
which no listing's plain `"Lodi, CA"` city/state text could ever contain
`", USA"` to match against.

**Fix:** strip a trailing `", USA"` / `", United States"` right at the
source — in the click handler, before the text flows into either the
geocoding call or the text-matching fallback — rather than patching each
downstream consumer separately. Also hardened the same stripping
server-side in the `/api/geocode` endpoint itself, independent of
whatever the frontend sends, consistent with how validation is handled
in two layers everywhere else in this app. Tested against Google's
actual output format, plain manually-typed input, "United States"
spelled out, a bare ZIP code, and a city with no state at all — all
parse correctly now.

## "USA" stripped from what's displayed too, not just parsed internally

Clicking a Google suggestion in "Change location" used to leave
`"Lodi, CA, USA"` sitting in the search box after selection — technically
working (the underlying regression from the previous fix was already
resolved), but visually redundant noise since Roost is US-only right now.
Added a listener that tidies the displayed text immediately after
selection, purely cosmetic — the actual geocoding/matching logic was
already cleaned separately and is untouched here.

Worth noting for later: if Roost ever expands outside the US, this is the
one spot that would need revisiting — right now it's a deliberate,
reasonable simplification for where the app actually is today, not an
oversight.

## The real fix for "0 results" — a genuine limitation, not a bug I introduced

Traced this properly rather than guessing again: confirmed directly from
the US Census Bureau's own documentation that their free geocoder is
built for full street addresses — *"the building number and street name
are required. City name, state, and ZIP code are optional."* A bare
"Lodi, CA" query was never reliably supported by it, even for a real,
well-known city. This was a pre-existing limitation, documented in this
codebase's own comments from before autocomplete was ever added — not
something the recent changes broke.

**The real fix:** both the location search and the post form's city field
now capture real coordinates directly from Google's Places response when
a suggestion is actually selected — at no extra cost (same API session,
just requesting one more field) — and use those directly instead of a
separate, less-reliable Census lookup. Census is kept only as a fallback
for the case where someone types a location without picking a suggestion.

This fix reaches two places:
- **Search** (`apply-location` handler) — uses the captured coordinates
  directly, skipping the Census call entirely when available.
- **Posting a listing** — the captured coordinates travel with the
  submission and get saved immediately, rather than only via the
  slower fire-and-forget Census geocoding afterward.

**A real safeguard added along the way:** if someone selects a suggestion
and then edits the text afterward, the captured coordinates are
explicitly cleared — otherwise a listing could end up saved with
coordinates for a *different* place than what's actually displayed.
Also explicitly cleared when starting a fresh post, editing an existing
one, or duplicating one, as defense in depth beyond just relying on the
required-field validation forcing a fresh interaction.

Tested the coordinate-selection logic against real coordinates, no
selection made, missing data, malformed input, and specifically the
classic "zero is a valid coordinate, not the same as missing" edge case
— all handled correctly.

## The actual bug behind "edited and re-selected Lodi, still 0 results"

Confirmed via direct SQL query that even after a correct manual edit +
dropdown re-selection, zero listings had saved coordinates — meaning the
previous round's fix had a real bug in it, not a user-error or a separate
issue. Traced it to a genuine race condition:

The code had a listener clearing the captured coordinates on any `input`
event, meant to protect against stale coordinates if someone edited the
text *after* selecting a suggestion. But Google's autocomplete widget
very likely fires its own synthetic `input` event as part of
programmatically filling in the selected suggestion's text — meaning
that "safety" listener could fire immediately after `place_changed`
captured real coordinates, silently wiping them right back out. Selecting
a suggestion looked like it worked (the city field filled in correctly),
but the coordinates never survived to the point of saving.

**Fixed by removing the event-ordering dependency entirely.** Instead of
a listener trying to clear stale state at the right moment, the exact
field text is captured *alongside* the coordinates, and compared against
the field's current text at the moment of use (search, or posting/
editing a listing). If they still match, the coordinates are used; if
the text has changed since, they're correctly treated as stale. This
sidesteps the whole category of "which event fires first" bugs rather
than trying to out-guess it.

Verified by directly simulating the exact race — capturing coordinates,
then simulating the suspected stray `input` event firing right after —
confirming the coordinates now survive it, while still correctly
dropping them if the field is genuinely edited afterward.

**Important: existing listings will need their coordinates re-captured
again after this deploys** — the edit-and-reselect attempt from before
this fix couldn't have worked, since the underlying bug was still live
at the time.

## Admin backfill tool for missing coordinates

Solves the real gap in the previous fixes: those only ever helped a
seller's *own* listing, since editing is (correctly, deliberately)
owner-only — there was never a way to fix *other people's* existing
listings that predate reliable geocoding. New admin-only tool in Site
Stats: "Find and fix listings missing coordinates."

- Runs entirely in the admin's own browser, not the server — the Places/
  Maps key is restricted to the site's domain via HTTP referrer, which
  only a real browser request satisfies; a server-to-server call from
  DigitalOcean wouldn't carry that header at all.
- Uses `google.maps.Geocoder` specifically (not Places Autocomplete) —
  this needs the separate **Geocoding API** enabled in Google Cloud and
  added to the existing key's restrictions, since it's a genuinely
  different product from Places/Maps JavaScript despite sharing the same
  loaded script.
- Throttled between requests (250ms) rather than firing everything in a
  tight loop — reasonable API citizenship, not just a technical
  requirement.
- Safe to run more than once — only ever queries for listings still
  missing coordinates, so already-fixed ones are automatically skipped.
- Two new admin-only endpoints: `GET /api/listings/admin/missing-coords`
  (finds what needs fixing) and `PATCH /api/listings/:id/coordinates`
  (updates just the coordinates — deliberately separate from the
  owner-only full-edit route, since an admin fixing coordinates has no
  reason to need permission over anything else on someone else's
  listing).
- **A real validation gap caught and fixed before shipping**: the
  coordinate check used `Number(lat)` before validating — but
  `Number(null)` evaluates to `0`, which is technically a finite number.
  That meant an explicitly-null request could have silently passed
  validation as if `(0, 0)` were a real, intended coordinate. Fixed by
  explicitly rejecting `null`/`undefined` before the numeric conversion,
  confirmed with a direct test that a genuine `(0, 0)` coordinate still
  correctly passes.

## Real bug: comma broke the fallback text match

Reported as "dropdown selection shows 0 results, but plain typing works"
— the opposite of what should happen if the recent coordinate fixes were
the only factor, which was the tell that something else was going on.

Confirmed directly in the code: the fallback text-match builds a
listing's searchable text as `"lodi ca"` (space-separated, no comma), but
selecting a Places suggestion produces search text like `"Lodi, CA"`
**with a comma**. `"lodi ca".includes("lodi, ca")` is false — the comma
alone broke an otherwise-correct match, even for the exact same city.
Plain typing ("Lodi", no comma) worked purely by accident, not because
that path was actually more correct.

Fixed by stripping commas from both sides before comparing. Tested the
exact previously-broken case (comma-containing search text against
comma-free listing text) alongside the previously-working case and a
genuinely-different city, to confirm the fix doesn't just patch the
reported symptom while accidentally breaking or over-matching something
else.

**This fixes the fallback path specifically — it doesn't yet confirm
whether the deeper coordinate-based distance search is fully working**,
which depends on whether the backfill tool actually populated real
coordinates on existing listings. That still needs direct verification.

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
