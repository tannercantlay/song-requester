-- migrate:up

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy catalog search

-- Single admin (you). Password hashed with Argon2 by the app.
CREATE TABLE admin (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     text NOT NULL UNIQUE,
  password_hash             text NOT NULL,
  spotify_refresh_token_enc text,           -- AES-GCM encrypted at rest
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- Curated catalog (seeded manually or imported from Spotify).
CREATE TABLE song (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  artist        text NOT NULL,
  album         text,
  album_art_url text,
  duration_ms   integer,
  spotify_uri   text UNIQUE,               -- set when imported; idempotent re-import key
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX song_active_idx      ON song (is_active);
CREATE INDEX song_title_trgm_idx  ON song USING gin (title gin_trgm_ops);
CREATE INDEX song_artist_trgm_idx ON song USING gin (artist gin_trgm_ops);

-- One row per gig; public_token goes in the QR URL.
CREATE TABLE event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  public_token    text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  requests_paused boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);

-- One request row per song per event; duplicate requests become upvotes.
CREATE TABLE request (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  song_id        uuid NOT NULL REFERENCES song(id),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','playing','played','dismissed')),
  vote_count     integer NOT NULL DEFAULT 1,
  queue_position integer,                   -- manual admin order; NULL => vote/recency sort
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  played_at      timestamptz,
  UNIQUE (event_id, song_id)
);
CREATE INDEX request_event_status_idx ON request (event_id, status);
CREATE INDEX request_queue_idx        ON request (event_id, queue_position);

-- Dedupe upvotes per anonymous guest; carries optional name/dedication.
CREATE TABLE request_vote (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES request(id) ON DELETE CASCADE,
  requester_token text NOT NULL,
  requester_name  text,                     -- app enforces length cap + profanity filter
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, requester_token)
);
CREATE INDEX request_vote_request_idx ON request_vote (request_id);

-- Guests you've muted for an event.
CREATE TABLE blocked_guest (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  requester_token text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, requester_token)
);

-- Keep request.updated_at fresh automatically.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER request_set_updated_at
  BEFORE UPDATE ON request
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS request_set_updated_at ON request;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS blocked_guest;
DROP TABLE IF EXISTS request_vote;
DROP TABLE IF EXISTS request;
DROP TABLE IF EXISTS event;
DROP TABLE IF EXISTS song;
DROP TABLE IF EXISTS admin;
