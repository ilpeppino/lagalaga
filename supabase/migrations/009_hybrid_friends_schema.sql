/*
 * Hybrid Friends System - Database Schema
 *
 * Creates two tables:
 * 1. roblox_friends_cache - Per-user snapshot of Roblox friends (discovery)
 * 2. friendships - App-native LagaLaga friendships (authorization)
 *
 * Related: docs/features/hybrid-friends.md
 */

-- ===========================================================================
-- Table: roblox_friends_cache
-- ===========================================================================
-- Per-user snapshot of their Roblox friends list for discovery/suggestions.
-- Synced from public Roblox API (no auth required).

CREATE TABLE IF NOT EXISTS public.roblox_friends_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  roblox_friend_user_id TEXT NOT NULL,
  roblox_friend_username TEXT,
  roblox_friend_display_name TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT fk_roblox_friends_cache_user
    FOREIGN KEY (user_id)
    REFERENCES public.app_users(id)
    ON DELETE CASCADE,

  CONSTRAINT uq_roblox_friends_cache_user_friend
    UNIQUE (user_id, roblox_friend_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roblox_friends_cache_roblox_user_id
  ON public.roblox_friends_cache(roblox_friend_user_id);

CREATE INDEX IF NOT EXISTS idx_roblox_friends_cache_user_synced
  ON public.roblox_friends_cache(user_id, synced_at);

-- RLS (defense-in-depth)
ALTER TABLE public.roblox_friends_cache ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own cached friends
CREATE POLICY roblox_friends_cache_select_own
  ON public.roblox_friends_cache
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ===========================================================================
-- Table: friendships
-- ===========================================================================
-- App-native LagaLaga friendships using canonical ordering pattern.
-- One row per friendship pair (user_id < friend_id enforced).

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  initiated_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT fk_friendships_user
    FOREIGN KEY (user_id)
    REFERENCES public.app_users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_friendships_friend
    FOREIGN KEY (friend_id)
    REFERENCES public.app_users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_friendships_initiated_by
    FOREIGN KEY (initiated_by)
    REFERENCES public.app_users(id)
    ON DELETE CASCADE,

  -- Canonical ordering: user_id must be less than friend_id
  CONSTRAINT chk_friendships_canonical_order
    CHECK (user_id < friend_id),

  -- Status validation
  CONSTRAINT chk_friendships_status
    CHECK (status IN ('pending', 'accepted', 'blocked')),

  -- One row per pair
  CONSTRAINT uq_friendships_user_friend
    UNIQUE (user_id, friend_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_friendships_user_status
  ON public.friendships(user_id, status);

CREATE INDEX IF NOT EXISTS idx_friendships_friend_status
  ON public.friendships(friend_id, status);

-- Partial index for pending requests
CREATE INDEX IF NOT EXISTS idx_friendships_pending
  ON public.friendships(status)
  WHERE status = 'pending';

-- RLS (defense-in-depth)
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can SELECT friendships where they are involved (either side)
CREATE POLICY friendships_select_own
  ON public.friendships
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR friend_id = auth.uid()
  );

-- Grant permissions
GRANT SELECT ON public.roblox_friends_cache TO authenticated;
GRANT SELECT ON public.friendships TO authenticated;

-- Service role needs full access for backend operations
GRANT ALL ON public.roblox_friends_cache TO service_role;
GRANT ALL ON public.friendships TO service_role;
