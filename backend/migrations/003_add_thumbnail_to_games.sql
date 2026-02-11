-- Add thumbnail_url to games table for Roblox game enrichment
-- Run this migration if thumbnail_url column doesn't exist yet

ALTER TABLE games ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_games_thumbnail_url ON games(thumbnail_url) WHERE thumbnail_url IS NOT NULL;

-- Update updated_at trigger to include thumbnail_url
CREATE OR REPLACE FUNCTION update_games_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS games_updated_at_trigger ON games;

CREATE TRIGGER games_updated_at_trigger
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION update_games_updated_at();
