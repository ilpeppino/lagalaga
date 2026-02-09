-- Create sessions + games schema used by both v1 and v2 backend endpoints.
-- This migration is designed to be safe to run repeatedly in Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS games (
  -- v1 uses UUID id + url
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_key TEXT,
  name TEXT,
  url TEXT UNIQUE,
  genre TEXT,

  -- v2 uses Roblox place_id + canonical URLs
  place_id BIGINT UNIQUE,
  canonical_web_url TEXT,
  canonical_start_url TEXT,
  game_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_place_id ON games(place_id);
CREATE INDEX IF NOT EXISTS idx_games_url ON games(url);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- v1 fields
  host_user_id UUID,
  game_id UUID,
  start_time_utc TIMESTAMPTZ,
  duration_minutes INTEGER,
  max_players INTEGER,
  session_type TEXT,

  -- shared fields
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'active',

  -- v2 fields
  place_id BIGINT,
  host_id UUID,
  description TEXT,
  max_participants INTEGER NOT NULL DEFAULT 10,
  scheduled_start TIMESTAMPTZ,
  original_input_url TEXT,
  normalized_from TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_visibility ON sessions(visibility);
CREATE INDEX IF NOT EXISTS idx_sessions_place_id ON sessions(place_id);
CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_sessions_host_user_id ON sessions(host_user_id);

-- Foreign keys (conditional, to be re-runnable)
DO $$
BEGIN
  -- v1: sessions.game_id -> games.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_game') THEN
    ALTER TABLE sessions
      ADD CONSTRAINT fk_sessions_game
      FOREIGN KEY (game_id)
      REFERENCES games(id)
      ON DELETE SET NULL;
  END IF;

  -- v2: sessions.place_id -> games.place_id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_place') THEN
    ALTER TABLE sessions
      ADD CONSTRAINT fk_sessions_place
      FOREIGN KEY (place_id)
      REFERENCES games(place_id)
      ON DELETE SET NULL;
  END IF;

  -- v2: sessions.host_id -> app_users.id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_host_id') THEN
      ALTER TABLE sessions
        ADD CONSTRAINT fk_sessions_host_id
        FOREIGN KEY (host_id)
        REFERENCES app_users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- session_participants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS session_participants (
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  state TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_user_id ON session_participants(user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_participants_session') THEN
    ALTER TABLE session_participants
      ADD CONSTRAINT fk_session_participants_session
      FOREIGN KEY (session_id)
      REFERENCES sessions(id)
      ON DELETE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_participants_user') THEN
      ALTER TABLE session_participants
        ADD CONSTRAINT fk_session_participants_user
        FOREIGN KEY (user_id)
        REFERENCES app_users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- session_invites
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS session_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  created_by UUID NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_invites_session_id ON session_invites(session_id);
CREATE INDEX IF NOT EXISTS idx_session_invites_invite_code ON session_invites(invite_code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_invites_session') THEN
    ALTER TABLE session_invites
      ADD CONSTRAINT fk_session_invites_session
      FOREIGN KEY (session_id)
      REFERENCES sessions(id)
      ON DELETE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_invites_created_by') THEN
      ALTER TABLE session_invites
        ADD CONSTRAINT fk_session_invites_created_by
        FOREIGN KEY (created_by)
        REFERENCES app_users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

