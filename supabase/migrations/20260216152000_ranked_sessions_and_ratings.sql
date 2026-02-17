/*
 * Sprint 2: Ranked sessions + lightweight ratings
 * Additive migration:
 * - sessions.is_ranked
 * - user_rankings table
 * - match_results table
 * - transactional RPC for result submission
 * - weekly leaderboard RPC (Europe/Amsterdam)
 */

-- Ranked flag on sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_ranked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_is_ranked_created_at
  ON sessions(is_ranked, created_at DESC);

-- Per-user ranking snapshot
CREATE TABLE IF NOT EXISTS user_rankings (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  rating INT NOT NULL DEFAULT 1000,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  last_ranked_match_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_rankings_rating_desc
  ON user_rankings(rating DESC);

-- One result row per ranked session
CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  winner_id UUID NOT NULL REFERENCES app_users(id),
  rating_delta INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_results_session_id_unique
  ON match_results(session_id);

-- RLS: backend/service-role only
ALTER TABLE user_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_rankings' AND policyname = 'Service role can manage user_rankings'
  ) THEN
    CREATE POLICY "Service role can manage user_rankings"
      ON user_rankings
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'match_results' AND policyname = 'Service role can manage match_results'
  ) THEN
    CREATE POLICY "Service role can manage match_results"
      ON match_results
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Transactional ranked result submission.
-- If this function raises, all updates are rolled back.
CREATE OR REPLACE FUNCTION submit_ranked_match_result(
  p_session_id UUID,
  p_winner_id UUID,
  p_submitted_by_user_id UUID,
  p_rating_delta INT DEFAULT 25,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  user_id UUID,
  rating INT,
  wins INT,
  losses INT,
  delta INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session RECORD;
  v_participant_ids UUID[];
  v_participant_count INT;
BEGIN
  SELECT id, host_id, is_ranked, status
  INTO v_session
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  IF v_session.host_id <> p_submitted_by_user_id THEN
    RAISE EXCEPTION 'RANKING_FORBIDDEN';
  END IF;

  IF v_session.is_ranked IS NOT TRUE THEN
    RAISE EXCEPTION 'RANKED_REQUIRED';
  END IF;

  IF v_session.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  IF EXISTS (SELECT 1 FROM match_results WHERE session_id = p_session_id) THEN
    RAISE EXCEPTION 'MATCH_RESULT_EXISTS';
  END IF;

  SELECT ARRAY_AGG(user_id), COUNT(*)
  INTO v_participant_ids, v_participant_count
  FROM session_participants
  WHERE session_id = p_session_id
    AND state = 'joined';

  IF COALESCE(v_participant_count, 0) < 2 THEN
    RAISE EXCEPTION 'INSUFFICIENT_PARTICIPANTS';
  END IF;

  IF NOT (p_winner_id = ANY(v_participant_ids)) THEN
    RAISE EXCEPTION 'INVALID_WINNER';
  END IF;

  INSERT INTO user_rankings (user_id)
  SELECT UNNEST(v_participant_ids)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_rankings
  SET
    rating = rating + p_rating_delta,
    wins = wins + 1,
    last_ranked_match_at = p_occurred_at,
    updated_at = NOW()
  WHERE user_id = p_winner_id;

  UPDATE user_rankings
  SET
    rating = rating - p_rating_delta,
    losses = losses + 1,
    last_ranked_match_at = p_occurred_at,
    updated_at = NOW()
  WHERE user_id = ANY(v_participant_ids)
    AND user_id <> p_winner_id;

  INSERT INTO match_results (session_id, winner_id, rating_delta, created_at)
  VALUES (p_session_id, p_winner_id, p_rating_delta, p_occurred_at);

  RETURN QUERY
  SELECT
    ur.user_id,
    ur.rating,
    ur.wins,
    ur.losses,
    CASE WHEN ur.user_id = p_winner_id THEN p_rating_delta ELSE -p_rating_delta END AS delta
  FROM user_rankings ur
  WHERE ur.user_id = ANY(v_participant_ids)
  ORDER BY ur.rating DESC, ur.user_id;
END;
$$;

-- Weekly leaderboard in Europe/Amsterdam timezone.
CREATE OR REPLACE FUNCTION get_weekly_leaderboard(p_limit INT DEFAULT 10)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  rating INT,
  wins INT,
  losses INT,
  display_name TEXT
)
LANGUAGE sql
AS $$
  WITH bounds AS (
    SELECT
      (date_trunc('week', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam') AS week_start
  ),
  ranked AS (
    SELECT
      ur.user_id,
      ur.rating,
      ur.wins,
      ur.losses,
      COALESCE(NULLIF(au.roblox_display_name, ''), NULLIF(au.roblox_username, '')) AS display_name
    FROM user_rankings ur
    LEFT JOIN app_users au ON au.id = ur.user_id
    CROSS JOIN bounds b
    WHERE ur.last_ranked_match_at IS NOT NULL
      AND ur.last_ranked_match_at >= b.week_start
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY rating DESC, user_id)::BIGINT AS rank,
    user_id,
    rating,
    wins,
    losses,
    display_name
  FROM ranked
  ORDER BY rating DESC, user_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;
