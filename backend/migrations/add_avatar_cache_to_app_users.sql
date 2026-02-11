-- Migration: Add avatar caching columns to app_users table
-- Description: Adds avatar_headshot_url and avatar_cached_at columns to cache Roblox user avatars
-- Date: 2026-02-11

ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS avatar_headshot_url TEXT NULL,
ADD COLUMN IF NOT EXISTS avatar_cached_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN app_users.avatar_headshot_url IS 'Cached Roblox avatar headshot URL';
COMMENT ON COLUMN app_users.avatar_cached_at IS 'Timestamp when avatar was last cached (24 hour TTL)';
