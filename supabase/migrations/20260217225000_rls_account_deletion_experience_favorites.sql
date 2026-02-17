-- ============================================================================
-- RLS for account_deletion_requests, roblox_experience_cache, user_favorites_cache
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- account_deletion_requests
-- Sensitive audit log: users may view their own request; all writes are
-- service-role-only (backend manages the full lifecycle).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deletion request"
  ON public.account_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Deletion requests created by service role only"
  ON public.account_deletion_requests FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Deletion requests updated by service role only"
  ON public.account_deletion_requests FOR UPDATE
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Deletion requests deleted by service role only"
  ON public.account_deletion_requests FOR DELETE
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────────
-- roblox_experience_cache
-- Shared, non-user-specific cache of public Roblox game metadata (URL → name/
-- place ID). Safe to read publicly; all writes are service-role-only.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.roblox_experience_cache ENABLE ROW LEVEL SECURITY;

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

-- ────────────────────────────────────────────────────────────────────────────
-- user_favorites_cache
-- Per-user private cache of Roblox favorites. Users may only read their own
-- row; all writes are service-role-only (backend refreshes the cache).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_favorites_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites cache"
  ON public.user_favorites_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Favorites cache created by service role only"
  ON public.user_favorites_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Favorites cache updated by service role only"
  ON public.user_favorites_cache FOR UPDATE
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Favorites cache deleted by service role only"
  ON public.user_favorites_cache FOR DELETE
  USING (auth.role() = 'service_role');
