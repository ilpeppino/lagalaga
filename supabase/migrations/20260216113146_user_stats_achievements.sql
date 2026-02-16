/*
 * User Stats and Achievements Migration
 *
 * This migration creates tables for tracking user statistics and achievements.
 * - user_stats: tracks sessions_hosted, sessions_joined, streak_days
 * - user_achievements: tracks unlocked achievements (FIRST_HOST, FIRST_JOIN, etc.)
 */

-- ============================================================================
-- USER_STATS TABLE
-- ============================================================================

CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  sessions_hosted INT NOT NULL DEFAULT 0,
  sessions_joined INT NOT NULL DEFAULT 0,
  streak_days INT NOT NULL DEFAULT 0,
  last_active_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for query performance
CREATE INDEX idx_user_stats_updated_at ON user_stats(updated_at);

-- Enable RLS (service role only for writes, no client SELECT policies)
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Service role can perform all operations
CREATE POLICY "Service role can manage user_stats"
  ON user_stats FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- USER_ACHIEVEMENTS TABLE
-- ============================================================================

CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, code)
);

-- Index for query performance
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);

-- Enable RLS (service role only for writes, no client SELECT policies)
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Service role can perform all operations
CREATE POLICY "Service role can manage user_achievements"
  ON user_achievements FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
