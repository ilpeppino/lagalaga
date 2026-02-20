/*
 * Add dedicated archival column for sessions and exclude archived sessions
 * from listing RPCs.
 */

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_archived_at
  ON public.sessions(archived_at)
  WHERE archived_at IS NOT NULL;

-- Ensure old signatures are replaced so listing behavior is explicit.
DROP FUNCTION IF EXISTS public.list_sessions_optimized(TEXT, TEXT, INT, UUID, INT, INT, UUID);
DROP FUNCTION IF EXISTS public.list_sessions_optimized(TEXT, TEXT, INT, UUID, INT, INT);
DROP FUNCTION IF EXISTS public.list_user_planned_sessions_optimized(UUID, INT, INT);

CREATE OR REPLACE FUNCTION public.list_sessions_optimized(
  p_status TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT NULL,
  p_place_id INT DEFAULT NULL,
  p_host_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_requester_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  place_id INT,
  host_id UUID,
  title TEXT,
  description TEXT,
  visibility TEXT,
  status TEXT,
  max_participants INT,
  scheduled_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  original_input_url TEXT,
  normalized_from TEXT,
  game_place_id INT,
  game_name TEXT,
  canonical_web_url TEXT,
  canonical_start_url TEXT,
  thumbnail_url TEXT,
  participant_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.place_id,
    s.host_id,
    s.title,
    s.description,
    s.visibility::TEXT,
    s.status::TEXT,
    s.max_participants,
    s.scheduled_start,
    s.created_at,
    s.original_input_url,
    s.normalized_from,
    g.place_id AS game_place_id,
    g.game_name,
    g.canonical_web_url,
    g.canonical_start_url,
    g.thumbnail_url,
    COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.state = 'joined') AS participant_count,
    COUNT(*) OVER() AS total_count
  FROM public.sessions s
  LEFT JOIN public.games g ON s.place_id = g.place_id
  LEFT JOIN public.session_participants sp ON s.id = sp.session_id
  WHERE s.archived_at IS NULL
    AND (p_status IS NULL OR s.status::TEXT = p_status)
    AND (p_visibility IS NULL OR s.visibility::TEXT = p_visibility)
    AND (p_place_id IS NULL OR s.place_id = p_place_id)
    AND (p_host_id IS NULL OR s.host_id = p_host_id)
    AND (
      s.visibility != 'friends'
      OR s.host_id = p_requester_id
      OR EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND f.user_id = LEAST(p_requester_id, s.host_id)
          AND f.friend_id = GREATEST(p_requester_id, s.host_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.session_participants sp2
        WHERE sp2.session_id = s.id
          AND sp2.user_id = p_requester_id
          AND sp2.state IN ('joined', 'invited')
      )
    )
  GROUP BY
    s.id,
    s.place_id,
    s.host_id,
    s.title,
    s.description,
    s.visibility,
    s.status,
    s.max_participants,
    s.scheduled_start,
    s.created_at,
    s.original_input_url,
    s.normalized_from,
    g.place_id,
    g.game_name,
    g.canonical_web_url,
    g.canonical_start_url,
    g.thumbnail_url
  ORDER BY s.scheduled_start DESC NULLS LAST, s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_sessions_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_sessions_optimized TO service_role;

CREATE OR REPLACE FUNCTION public.list_user_planned_sessions_optimized(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  place_id INT,
  host_id UUID,
  title TEXT,
  description TEXT,
  visibility TEXT,
  status TEXT,
  max_participants INT,
  scheduled_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  original_input_url TEXT,
  normalized_from TEXT,
  game_place_id INT,
  game_name TEXT,
  canonical_web_url TEXT,
  canonical_start_url TEXT,
  thumbnail_url TEXT,
  participant_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.place_id,
    s.host_id,
    s.title,
    s.description,
    s.visibility::TEXT,
    s.status::TEXT,
    s.max_participants,
    s.scheduled_start,
    s.created_at,
    s.original_input_url,
    s.normalized_from,
    g.place_id AS game_place_id,
    g.game_name,
    g.canonical_web_url,
    g.canonical_start_url,
    g.thumbnail_url,
    COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.state = 'joined') AS participant_count,
    COUNT(*) OVER() AS total_count
  FROM public.sessions s
  LEFT JOIN public.games g ON s.place_id = g.place_id
  LEFT JOIN public.session_participants sp ON s.id = sp.session_id
  WHERE s.archived_at IS NULL
    AND s.host_id = p_user_id
    AND s.status IN ('scheduled', 'active')
  GROUP BY
    s.id,
    s.place_id,
    s.host_id,
    s.title,
    s.description,
    s.visibility,
    s.status,
    s.max_participants,
    s.scheduled_start,
    s.created_at,
    s.original_input_url,
    s.normalized_from,
    g.place_id,
    g.game_name,
    g.canonical_web_url,
    g.canonical_start_url,
    g.thumbnail_url
  ORDER BY s.scheduled_start ASC NULLS LAST, s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_user_planned_sessions_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_planned_sessions_optimized TO service_role;
