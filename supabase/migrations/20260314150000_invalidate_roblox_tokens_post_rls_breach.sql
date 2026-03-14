-- Migration: invalidate_roblox_tokens_post_rls_breach
--
-- INCIDENT RESPONSE for RLS breach on user_platforms (see migration 20260314140000).
-- The over-broad USING (true) SELECT policy exposed roblox_access_token_enc and
-- roblox_refresh_token_enc to unauthenticated callers during the exposure window.
--
-- Even though tokens are encrypted at rest, we cannot rule out that the encryption
-- key could be compromised in the future. As a precautionary measure:
--
--   1. All stored Roblox OAuth tokens are cleared, forcing re-authentication.
--   2. app_users.token_version is incremented for all users, invalidating all
--      existing JWT sessions so users must log in again.
--
-- This is a one-time remediation. After this migration runs, users will be
-- prompted to reconnect their Roblox account on next login.

-- Step 1: Clear all Roblox OAuth tokens from user_platforms.
-- Users will be required to re-link their Roblox account.
UPDATE user_platforms
SET
  platform_access_token  = NULL,
  platform_refresh_token = NULL,
  roblox_access_token_enc  = NULL,
  roblox_refresh_token_enc = NULL,
  updated_at = NOW()
WHERE platform_id = 'roblox';

-- Step 2: Increment token_version for all active users.
-- The authenticate middleware rejects JWTs whose tokenVersion doesn't match,
-- so all existing sessions are immediately invalidated.
UPDATE app_users
SET
  token_version = token_version + 1,
  updated_at    = NOW()
WHERE status = 'ACTIVE';
