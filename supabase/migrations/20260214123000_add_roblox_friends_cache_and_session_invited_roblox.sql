/*
 * Friend-based participant selection support.
 * - Cache Roblox friends with 24h TTL
 * - Persist invited Roblox IDs per session
 */

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'roblox_friends_cache'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'roblox_friends_cache'
      AND column_name = 'expires_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'roblox_friends_cache_legacy'
    ) THEN
      DROP TABLE public.roblox_friends_cache;
    ELSE
      ALTER TABLE public.roblox_friends_cache RENAME TO roblox_friends_cache_legacy;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.roblox_friends_cache (
  user_id UUID PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  roblox_user_id BIGINT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  friends_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  etag TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roblox_friends_cache_expires_at
  ON public.roblox_friends_cache (expires_at);

CREATE TABLE IF NOT EXISTS public.session_invited_roblox (
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  roblox_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, roblox_user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_invited_roblox_session
  ON public.session_invited_roblox (session_id);

CREATE INDEX IF NOT EXISTS idx_session_invited_roblox_roblox_user
  ON public.session_invited_roblox (roblox_user_id);

ALTER TABLE public.roblox_friends_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_invited_roblox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roblox friends cache owner read" ON public.roblox_friends_cache;
DROP POLICY IF EXISTS "Roblox friends cache service insert" ON public.roblox_friends_cache;
DROP POLICY IF EXISTS "Roblox friends cache service update" ON public.roblox_friends_cache;
DROP POLICY IF EXISTS "Roblox friends cache service delete" ON public.roblox_friends_cache;
DROP POLICY IF EXISTS "roblox_friends_cache_select_own" ON public.roblox_friends_cache;

CREATE POLICY "Roblox friends cache owner read"
  ON public.roblox_friends_cache
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Roblox friends cache service insert"
  ON public.roblox_friends_cache
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Roblox friends cache service update"
  ON public.roblox_friends_cache
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Roblox friends cache service delete"
  ON public.roblox_friends_cache
  FOR DELETE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Session invited roblox service select" ON public.session_invited_roblox;
DROP POLICY IF EXISTS "Session invited roblox service insert" ON public.session_invited_roblox;
DROP POLICY IF EXISTS "Session invited roblox service update" ON public.session_invited_roblox;
DROP POLICY IF EXISTS "Session invited roblox service delete" ON public.session_invited_roblox;

CREATE POLICY "Session invited roblox service select"
  ON public.session_invited_roblox
  FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Session invited roblox service insert"
  ON public.session_invited_roblox
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Session invited roblox service update"
  ON public.session_invited_roblox
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Session invited roblox service delete"
  ON public.session_invited_roblox
  FOR DELETE
  USING (auth.role() = 'service_role');
