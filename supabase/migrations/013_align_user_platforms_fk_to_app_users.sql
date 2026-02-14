/*
 * Align user_platforms.user_id foreign key to app_users.id.
 *
 * Backend JWT/user model uses public.app_users.id as canonical user identity.
 * Safe to run multiple times.
 */

ALTER TABLE public.user_platforms
  DROP CONSTRAINT IF EXISTS user_platforms_user_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'app_users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_user_platforms_user'
    ) THEN
      ALTER TABLE public.user_platforms
        ADD CONSTRAINT fk_user_platforms_user
        FOREIGN KEY (user_id)
        REFERENCES public.app_users(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
