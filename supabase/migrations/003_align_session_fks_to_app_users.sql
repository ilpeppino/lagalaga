/*
 * Align session-related foreign keys to app_users.
 *
 * The backend issues its own JWTs and uses `app_users.id` as the canonical user id.
 * Some environments may have session FKs pointing at `auth.users.id`, which will
 * cause inserts/updates to fail for session creation/join flows.
 *
 * This migration:
 * - Drops FKs from sessions/session_participants/session_invites that reference auth.users
 * - Ensures equivalent FKs exist referencing public.app_users
 *
 * Safe to run multiple times.
 */

-- sessions.host_id should reference public.app_users.id (not auth.users.id)
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

-- session_participants.user_id should reference public.app_users.id (not auth.users.id)
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

-- session_invites.created_by should reference public.app_users.id (not auth.users.id)
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

