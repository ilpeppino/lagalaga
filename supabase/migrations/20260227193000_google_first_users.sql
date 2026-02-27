/*
 * Enable Google-first accounts by allowing app_users records without Roblox fields.
 */

ALTER TABLE public.app_users
  ALTER COLUMN roblox_user_id DROP NOT NULL;

ALTER TABLE public.app_users
  ALTER COLUMN roblox_username DROP NOT NULL;

COMMENT ON COLUMN public.app_users.roblox_user_id IS
  'Nullable until Roblox account is linked; remains unique when present.';

COMMENT ON COLUMN public.app_users.roblox_username IS
  'Nullable until Roblox account is linked.';

INSERT INTO public.platforms (id, name, icon_url, deep_link_scheme)
VALUES ('google', 'Google', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Verification queries (run manually after migration):
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_name='app_users'
--   AND column_name IN ('roblox_user_id','roblox_username');
--
-- SELECT *
-- FROM platforms
-- WHERE id='google';
