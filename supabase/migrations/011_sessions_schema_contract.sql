/*
 * Sessions Schema Contract
 *
 * Establishes the minimum schema required by backend SessionServiceV2.
 * Safe to run multiple times.
 */

-- ---------------------------------------------------------------------------
-- session_participants contract
-- ---------------------------------------------------------------------------

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS handoff_state TEXT NOT NULL DEFAULT 'rsvp_joined',
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_participants_handoff_state_check'
  ) THEN
    ALTER TABLE public.session_participants
      ADD CONSTRAINT session_participants_handoff_state_check
      CHECK (handoff_state IN ('rsvp_joined', 'opened_roblox', 'confirmed_in_game', 'stuck'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_participants_session_handoff_state
  ON public.session_participants(session_id, handoff_state);

-- ---------------------------------------------------------------------------
-- session_invites contract
-- ---------------------------------------------------------------------------

ALTER TABLE public.session_invites
  ADD COLUMN IF NOT EXISTS max_uses INTEGER,
  ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_invites_max_uses_check'
  ) THEN
    ALTER TABLE public.session_invites
      ADD CONSTRAINT session_invites_max_uses_check
      CHECK (max_uses IS NULL OR max_uses > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_invites_uses_count_check'
  ) THEN
    ALTER TABLE public.session_invites
      ADD CONSTRAINT session_invites_uses_count_check
      CHECK (uses_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_invites_expired
  ON public.session_invites(expires_at)
  WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- FK alignment (idempotent)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_host_id_fkey;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_host_user') THEN
      ALTER TABLE public.sessions
        ADD CONSTRAINT fk_sessions_host_user
        FOREIGN KEY (host_id)
        REFERENCES public.app_users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

ALTER TABLE public.session_participants
  DROP CONSTRAINT IF EXISTS session_participants_user_id_fkey;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_participants_user') THEN
      ALTER TABLE public.session_participants
        ADD CONSTRAINT fk_session_participants_user
        FOREIGN KEY (user_id)
        REFERENCES public.app_users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

ALTER TABLE public.session_invites
  DROP CONSTRAINT IF EXISTS session_invites_created_by_fkey;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_invites_created_by') THEN
      ALTER TABLE public.session_invites
        ADD CONSTRAINT fk_session_invites_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.app_users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
