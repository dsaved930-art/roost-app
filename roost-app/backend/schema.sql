-- Roost database schema.
-- Run this once against your Postgres database before starting the server
-- (npm run migrate does this for you).

CREATE TABLE IF NOT EXISTS users (
  id                          SERIAL PRIMARY KEY,
  name                        TEXT NOT NULL,
  email                       TEXT UNIQUE NOT NULL,
  password_hash               TEXT,                     -- NULL for accounts auto-created via posting, until claimed
  google_id                   TEXT UNIQUE,
  role                        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  auto_created                BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified              BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status         TEXT NOT NULL DEFAULT 'none' CHECK (verification_status IN ('none', 'pending', 'verified', 'rejected')),
  verification_business_name  TEXT,
  verification_phone          TEXT,
  verification_document       TEXT,                     -- base64 image of a license/health cert/etc, optional
  verification_note           TEXT,                      -- admin's note, mainly used for rejection reasons
  verification_requested_at   TIMESTAMPTZ,
  verification_reviewed_at    TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT UNIQUE NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT UNIQUE NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id             SERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  category       TEXT NOT NULL,
  breed          TEXT,
  age            TEXT,
  sex            TEXT,
  free           BOOLEAN NOT NULL DEFAULT FALSE,
  price          NUMERIC NOT NULL DEFAULT 0,
  open_to_trade  BOOLEAN NOT NULL DEFAULT FALSE,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  description    TEXT NOT NULL,
  photo_thumb    TEXT,                          -- small base64 image for grid cards
  photo_full     TEXT,                          -- larger base64 image for detail view
  permit_number  TEXT,                          -- only set for Birds of Prey / Raptors listings
  poster_name    TEXT NOT NULL,
  contact_method TEXT NOT NULL,
  contact_value  TEXT NOT NULL,
  posted_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  view_count     INTEGER NOT NULL DEFAULT 0,
  sold           BOOLEAN NOT NULL DEFAULT FALSE,
  sold_at        TIMESTAMPTZ,
  lat            NUMERIC,          -- geocoded from city/state; NULL if geocoding failed or hasn't run
  lon            NUMERIC,
  dna_sexed      TEXT NOT NULL DEFAULT 'unknown' CHECK (dna_sexed IN ('yes','no','unknown')),
  hand_tame      TEXT NOT NULL DEFAULT 'unknown' CHECK (hand_tame IN ('yes','no','unknown')),
  shipping_available BOOLEAN NOT NULL DEFAULT FALSE,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','sold')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Up to 5 photos per listing. listings.photo_thumb/photo_full (above) stay
-- as a cached copy of photo #1 (position 0) specifically so every existing
-- browse/card/grid query that already selects those two columns keeps
-- working unchanged — only the full listing detail page needs to know about
-- the rest of the gallery.
CREATE TABLE IF NOT EXISTS listing_photos (
  id             SERIAL PRIMARY KEY,
  listing_id     INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  photo_thumb    TEXT NOT NULL,
  photo_full     TEXT NOT NULL,
  position       SMALLINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listing_photos_listing ON listing_photos (listing_id, position);

CREATE TABLE IF NOT EXISTS reports (
  id             SERIAL PRIMARY KEY,
  listing_id     INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_stats (
  key            TEXT PRIMARY KEY,
  value          BIGINT NOT NULL DEFAULT 0
);
INSERT INTO site_stats (key, value) VALUES ('pageviews', 0), ('listingviews', 0)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS conversations (
  id             SERIAL PRIMARY KEY,
  listing_id     INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id               SERIAL PRIMARY KEY,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body             TEXT NOT NULL,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_listing_id ON reports (listing_id);
CREATE TABLE IF NOT EXISTS reviews (
  id             SERIAL PRIMARY KEY,
  listing_id     INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  seller_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations (buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations (seller_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);
CREATE TABLE IF NOT EXISTS saved_searches (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  category       TEXT,                          -- NULL = any category
  query          TEXT,                          -- keyword text, NULL = no keyword filter
  price_min      NUMERIC,
  price_max      NUMERIC,
  location_text  TEXT,                          -- NULL = any location
  trade_only     BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = only match listings open to trade
  email_alerts   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_search_matches (
  id               SERIAL PRIMARY KEY,
  saved_search_id  INTEGER NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  listing_id       INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  notified_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at          TIMESTAMPTZ,
  UNIQUE (saved_search_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews (seller_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_search_matches_search ON saved_search_matches (saved_search_id);

-- These ALTER statements exist so that re-running this file against a
-- database that already had an older version of `users` (from before
-- verification was added) still picks up the new columns. On a brand-new
-- database these are no-ops since CREATE TABLE above already includes them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_business_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_document TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS open_to_trade BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_listings_open_to_trade ON listings (open_to_trade) WHERE open_to_trade = TRUE;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS trade_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sold BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_listings_sold ON listings (sold, sold_at DESC);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lon NUMERIC;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS dna_sexed TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hand_tame TEXT NOT NULL DEFAULT 'unknown';
-- Constraints added separately (can't be part of ADD COLUMN IF NOT EXISTS) —
-- these no-op safely on repeat runs since the constraint names are stable.
DO $$ BEGIN
  ALTER TABLE listings ADD CONSTRAINT listings_dna_sexed_check CHECK (dna_sexed IN ('yes','no','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE listings ADD CONSTRAINT listings_hand_tame_check CHECK (hand_tame IN ('yes','no','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS shipping_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE listings ADD CONSTRAINT listings_status_check CHECK (status IN ('active','pending','sold'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE listings SET status = 'sold' WHERE sold = TRUE AND status != 'sold';

CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users (verification_status);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens (token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens (token);
