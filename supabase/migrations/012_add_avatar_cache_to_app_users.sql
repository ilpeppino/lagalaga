/*
 * Add avatar cache fields to app_users.
 *
 * Required by backend services that read/write cached Roblox avatar headshots.
 * Safe to run multiple times.
 */

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS avatar_headshot_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_cached_at TIMESTAMPTZ;

COMMENT ON COLUMN public.app_users.avatar_headshot_url IS
  'Cached Roblox avatar headshot URL';

COMMENT ON COLUMN public.app_users.avatar_cached_at IS
  'Timestamp when avatar was last cached';
