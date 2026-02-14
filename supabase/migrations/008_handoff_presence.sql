/*
 * Handoff states + Roblox Presence OAuth token storage
 */

-- ---------------------------------------------------------------------------
-- session_participants: add app-level handoff tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS handoff_state TEXT NOT NULL DEFAULT 'rsvp_joined';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'session_participants_handoff_state_check'
  ) THEN
    ALTER TABLE public.session_participants
      ADD CONSTRAINT session_participants_handoff_state_check
      CHECK (handoff_state IN ('rsvp_joined', 'opened_roblox', 'confirmed_in_game', 'stuck'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_participants_session_handoff_state
  ON public.session_participants(session_id, handoff_state);

-- ---------------------------------------------------------------------------
-- user_platforms: store Roblox OAuth tokens for server-side Presence calls
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_platforms
  ADD COLUMN IF NOT EXISTS roblox_access_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS roblox_refresh_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS roblox_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS roblox_scope TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_platforms_roblox_token_expiry
  ON public.user_platforms(platform_id, roblox_token_expires_at)
  WHERE platform_id = 'roblox';
