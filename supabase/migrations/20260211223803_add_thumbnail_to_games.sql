/*
 * Add thumbnail_url to games table
 *
 * This migration adds a thumbnail_url column to the games table
 * to cache Roblox game thumbnails for better UX.
 *
 * Safe to run multiple times (uses IF NOT EXISTS).
 */

-- Add thumbnail_url column
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add index for thumbnail URL lookups (partial index for non-null values)
CREATE INDEX IF NOT EXISTS idx_games_thumbnail_url
  ON public.games(thumbnail_url)
  WHERE thumbnail_url IS NOT NULL;
