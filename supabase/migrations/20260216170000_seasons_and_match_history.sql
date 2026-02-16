/*
 * Sprint 3: Competitive Depth & Retention Layer
 * - seasons and season_rankings tables
 * - helper RPCs for anti-abuse checks and seasonal rollover
 * - idempotent and transaction-safe seasonal reset flow
 */

CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number INT NOT NULL UNIQUE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seasons_date_window_chk CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_seasons_active
  ON seasons(is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS season_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  final_rating INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT season_rankings_unique_season_user UNIQUE (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_season_rankings_final_rating_desc
  ON season_rankings(final_rating DESC);

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_rankings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'seasons'
      AND policyname = 'Service role can manage seasons'
  ) THEN
    CREATE POLICY "Service role can manage seasons"
      ON seasons
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'season_rankings'
      AND policyname = 'Service role can manage season_rankings'
  ) THEN
    CREATE POLICY "Service role can manage season_rankings"
      ON season_rankings
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION count_recent_ranked_matches_between_users(
  p_user_a UUID,
  p_user_b UUID,
  p_window_start TIMESTAMPTZ
)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(DISTINCT mr.session_id)::INT
  FROM match_results mr
  INNER JOIN sessions s ON s.id = mr.session_id AND s.is_ranked = true
  INNER JOIN session_participants p1
    ON p1.session_id = s.id
   AND p1.user_id = p_user_a
   AND p1.state = 'joined'
  INNER JOIN session_participants p2
    ON p2.session_id = s.id
   AND p2.user_id = p_user_b
   AND p2.state = 'joined'
  WHERE mr.created_at >= p_window_start;
$$;

CREATE OR REPLACE FUNCTION snapshot_rankings_for_season(
  p_season_id UUID
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INT;
BEGIN
  INSERT INTO season_rankings (season_id, user_id, final_rating, created_at)
  SELECT p_season_id, ur.user_id, ur.rating, NOW()
  FROM user_rankings ur
  ON CONFLICT (season_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

CREATE OR REPLACE FUNCTION reset_all_rankings_for_new_season()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE user_rankings
  SET rating = 1000,
      wins = 0,
      losses = 0,
      last_ranked_match_at = NULL,
      updated_at = NOW();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

CREATE OR REPLACE FUNCTION run_competitive_season_rollover(
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_active seasons%ROWTYPE;
  v_next_season_number INT;
  v_next_start TIMESTAMPTZ;
  v_next_end TIMESTAMPTZ;
  v_new_season_id UUID;
  v_snapshot_rows INT := 0;
  v_now_ams TIMESTAMPTZ;
BEGIN
  v_now_ams := (p_now AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam';

  -- Ensure there is exactly one active season baseline.
  SELECT *
  INTO v_active
  FROM seasons
  WHERE is_active = true
  ORDER BY season_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO seasons (season_number, start_date, end_date, is_active)
    VALUES (
      1,
      v_now_ams,
      v_now_ams + INTERVAL '28 days',
      true
    )
    RETURNING * INTO v_active;

    RETURN jsonb_build_object(
      'rolled_over', false,
      'previous_season_number', NULL,
      'new_active_season_number', v_active.season_number,
      'snapshot_rows', 0
    );
  END IF;

  -- Season still active.
  IF v_active.end_date > v_now_ams THEN
    RETURN jsonb_build_object(
      'rolled_over', false,
      'previous_season_number', v_active.season_number,
      'new_active_season_number', v_active.season_number,
      'snapshot_rows', 0
    );
  END IF;

  -- Idempotent snapshot.
  INSERT INTO season_rankings (season_id, user_id, final_rating, created_at)
  SELECT v_active.id, ur.user_id, ur.rating, NOW()
  FROM user_rankings ur
  ON CONFLICT (season_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_snapshot_rows = ROW_COUNT;

  -- Reset ratings exactly once while old season is still active and locked.
  UPDATE user_rankings
  SET rating = 1000,
      wins = 0,
      losses = 0,
      last_ranked_match_at = NULL,
      updated_at = NOW();

  UPDATE seasons
  SET is_active = false
  WHERE id = v_active.id
    AND is_active = true;

  v_next_season_number := v_active.season_number + 1;
  v_next_start := v_active.end_date;
  v_next_end := v_next_start + INTERVAL '28 days';

  INSERT INTO seasons (season_number, start_date, end_date, is_active)
  VALUES (v_next_season_number, v_next_start, v_next_end, true)
  ON CONFLICT (season_number)
  DO UPDATE SET is_active = EXCLUDED.is_active
  RETURNING id INTO v_new_season_id;

  RETURN jsonb_build_object(
    'rolled_over', true,
    'previous_season_number', v_active.season_number,
    'new_active_season_number', v_next_season_number,
    'snapshot_rows', COALESCE(v_snapshot_rows, 0)
  );
END;
$$;

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

  UPDATE sessions
  SET status = 'completed'
  WHERE id = p_session_id;

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
