ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS thumbnail_cached_at TIMESTAMPTZ;

-- Backfill existing enriched rows so freshness checks can use prior update time.
UPDATE public.games
SET thumbnail_cached_at = COALESCE(updated_at, created_at, NOW())
WHERE thumbnail_url IS NOT NULL
  AND thumbnail_cached_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_games_thumbnail_cached_at
  ON public.games (thumbnail_cached_at);
