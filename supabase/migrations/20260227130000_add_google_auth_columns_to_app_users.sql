ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS google_sub TEXT,
  ADD COLUMN IF NOT EXISTS google_email TEXT,
  ADD COLUMN IF NOT EXISTS google_email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_full_name TEXT;

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_auth_provider_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_auth_provider_check
  CHECK (auth_provider IN ('ROBLOX', 'APPLE', 'GOOGLE'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_google_sub
  ON public.app_users(google_sub)
  WHERE google_sub IS NOT NULL;
