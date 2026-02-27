ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'ROBLOX',
  ADD COLUMN IF NOT EXISTS apple_sub TEXT,
  ADD COLUMN IF NOT EXISTS apple_email TEXT,
  ADD COLUMN IF NOT EXISTS apple_email_is_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apple_full_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_auth_provider_check'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_auth_provider_check
      CHECK (auth_provider IN ('ROBLOX', 'APPLE'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_apple_sub
  ON public.app_users(apple_sub)
  WHERE apple_sub IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_auth_provider
  ON public.app_users(auth_provider);
