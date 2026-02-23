-- Ensure roblox_experience_cache is tracked by Supabase migrations.
-- This supersedes legacy local-only 007_add_roblox_experience_cache.sql.

CREATE TABLE IF NOT EXISTS public.roblox_experience_cache (
  id BIGSERIAL PRIMARY KEY,
  platform_key TEXT NOT NULL DEFAULT 'roblox',
  url TEXT NOT NULL,
  place_id TEXT NOT NULL,
  universe_id TEXT,
  name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roblox_experience_cache_url_key UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS idx_roblox_experience_cache_place_id
  ON public.roblox_experience_cache (place_id);

CREATE INDEX IF NOT EXISTS idx_roblox_experience_cache_updated_at
  ON public.roblox_experience_cache (updated_at DESC);

ALTER TABLE public.roblox_experience_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Experience cache is readable by everyone" ON public.roblox_experience_cache;
DROP POLICY IF EXISTS "Experience cache created by service role only" ON public.roblox_experience_cache;
DROP POLICY IF EXISTS "Experience cache updated by service role only" ON public.roblox_experience_cache;
DROP POLICY IF EXISTS "Experience cache deleted by service role only" ON public.roblox_experience_cache;

CREATE POLICY "Experience cache is readable by everyone"
  ON public.roblox_experience_cache FOR SELECT
  USING (true);

CREATE POLICY "Experience cache created by service role only"
  ON public.roblox_experience_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Experience cache updated by service role only"
  ON public.roblox_experience_cache FOR UPDATE
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Experience cache deleted by service role only"
  ON public.roblox_experience_cache FOR DELETE
  USING (auth.role() = 'service_role');
