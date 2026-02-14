/*
 * Create app_users table
 *
 * This table was created before the complete_rls_policies migration but
 * doesn't appear in the migration history. This migration reconstructs
 * the app_users table based on the current schema.
 *
 * Note: This migration should be run AFTER 001_core_schema and BEFORE
 * complete_rls_policies.
 */

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roblox_user_id VARCHAR NOT NULL UNIQUE,
  roblox_username VARCHAR NOT NULL,
  roblox_display_name VARCHAR,
  roblox_profile_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

COMMENT ON TABLE app_users IS 'Stores user accounts linked to Roblox OAuth';

-- Index for lookups by Roblox user ID
CREATE INDEX IF NOT EXISTS idx_app_users_roblox_user_id
  ON app_users(roblox_user_id);
