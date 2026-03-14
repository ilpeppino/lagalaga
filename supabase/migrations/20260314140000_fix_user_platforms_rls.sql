-- Migration: fix_user_platforms_rls
-- Removes the overly-broad USING (true) SELECT policy on user_platforms that
-- exposed encrypted OAuth tokens (roblox_access_token_enc,
-- roblox_refresh_token_enc) to unauthenticated callers.
--
-- Replacement: authenticated users may only read their own row.
-- The backend always uses the service-role key and bypasses RLS entirely,
-- so this change does not affect any backend reads.

-- Drop the old public-read policy
DROP POLICY IF EXISTS "Users can view other users' public platform info" ON user_platforms;

-- Restrict SELECT to the record's own user (authenticated)
CREATE POLICY "Users can read own platform record"
  ON user_platforms FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
