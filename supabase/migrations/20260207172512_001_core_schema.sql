/*
 * Epic 1: Database Schema & Migrations
 * Story 1.1: Core Session Tables
 *
 * This is the initial migration that creates all the base tables,
 * enums, and primary relationships for the LagaLaga application.
 *
 * NOTE: This migration was originally executed on Supabase with auth.users references.
 * Those references were later migrated to app_users in subsequent migrations.
 */

-- ============================================================================
-- GAMES TABLE
-- ============================================================================

CREATE TABLE games (
  place_id BIGINT PRIMARY KEY,
  canonical_web_url TEXT NOT NULL,
  canonical_start_url TEXT NOT NULL,
  game_name TEXT,
  game_description TEXT,
  thumbnail_url TEXT,
  max_players INT,
  creator_id BIGINT,
  creator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_games_creator ON games(creator_id);
CREATE INDEX idx_games_name ON games(game_name);

-- ============================================================================
-- CUSTOM TYPES (ENUMS)
-- ============================================================================

CREATE TYPE session_visibility AS ENUM ('public', 'friends', 'invite_only');
CREATE TYPE session_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');

-- ============================================================================
-- SESSIONS TABLE
-- ============================================================================

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id BIGINT NOT NULL REFERENCES games(place_id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  visibility session_visibility NOT NULL DEFAULT 'public',
  status session_status NOT NULL DEFAULT 'scheduled',

  max_participants INT NOT NULL DEFAULT 10 CHECK (max_participants > 0),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,

  original_input_url TEXT NOT NULL,
  normalized_from TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (scheduled_end IS NULL OR scheduled_end > scheduled_start)
);

CREATE INDEX idx_sessions_place ON sessions(place_id);
CREATE INDEX idx_sessions_host ON sessions(host_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_visibility ON sessions(visibility);
CREATE INDEX idx_sessions_scheduled_start ON sessions(scheduled_start);

-- ============================================================================
-- PARTICIPANT TYPES
-- ============================================================================

CREATE TYPE participant_role AS ENUM ('host', 'member');
CREATE TYPE participant_state AS ENUM ('invited', 'joined', 'left', 'kicked');

-- ============================================================================
-- SESSION_PARTICIPANTS TABLE
-- ============================================================================

CREATE TABLE session_participants (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role participant_role NOT NULL DEFAULT 'member',
  state participant_state NOT NULL DEFAULT 'joined',

  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,

  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_participants_user ON session_participants(user_id);
CREATE INDEX idx_participants_session_state ON session_participants(session_id, state);

-- ============================================================================
-- SESSION_INVITES TABLE
-- ============================================================================

CREATE TABLE session_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  invite_code TEXT NOT NULL UNIQUE,
  max_uses INT,
  uses_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (max_uses IS NULL OR max_uses > 0),
  CHECK (uses_count >= 0)
);

CREATE UNIQUE INDEX idx_invites_code ON session_invites(invite_code);
CREATE INDEX idx_invites_session ON session_invites(session_id);
CREATE INDEX idx_invites_expires ON session_invites(expires_at);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to games table
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to sessions table
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PLATFORMS TABLE
-- ============================================================================

CREATE TABLE platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_url TEXT,
  deep_link_scheme TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed platform data
INSERT INTO platforms (id, name, deep_link_scheme) VALUES
  ('roblox', 'Roblox', 'roblox://'),
  ('discord', 'Discord', 'discord://'),
  ('steam', 'Steam', 'steam://');

-- ============================================================================
-- USER_PLATFORMS TABLE
-- ============================================================================

CREATE TABLE user_platforms (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,

  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  platform_display_name TEXT,
  platform_avatar_url TEXT,

  is_primary BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (user_id, platform_id),
  UNIQUE (platform_id, platform_user_id)
);

CREATE INDEX idx_user_platforms_platform_user ON user_platforms(platform_id, platform_user_id);

-- Apply trigger to user_platforms table
CREATE TRIGGER update_user_platforms_updated_at BEFORE UPDATE ON user_platforms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
