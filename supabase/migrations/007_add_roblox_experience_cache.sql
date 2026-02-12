-- Cache Roblox experience-name resolution results for pasted URLs.
-- TTL is enforced in backend logic (24 hours).

CREATE TABLE IF NOT EXISTS roblox_experience_cache (
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
  ON roblox_experience_cache (place_id);

CREATE INDEX IF NOT EXISTS idx_roblox_experience_cache_updated_at
  ON roblox_experience_cache (updated_at DESC);
