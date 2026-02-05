-- Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roblox_user_id VARCHAR(255) UNIQUE NOT NULL,
  roblox_username VARCHAR(100) NOT NULL,
  roblox_display_name VARCHAR(100),
  roblox_profile_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Create index on roblox_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_users_roblox_user_id ON app_users(roblox_user_id);

-- Add foreign key constraint to sessions table
-- Note: This assumes the sessions table already exists
ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_host_user
  FOREIGN KEY (host_user_id)
  REFERENCES app_users(id)
  ON DELETE CASCADE;

-- Add comment
COMMENT ON TABLE app_users IS 'Stores user accounts linked to Roblox OAuth';
