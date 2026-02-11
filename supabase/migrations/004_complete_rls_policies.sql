/*
 * Complete RLS Policies Migration
 *
 * This migration completes the RLS setup by:
 * 1. Ensuring RLS is enabled on ALL public tables
 * 2. Adding missing policies for platforms and app_users tables
 * 3. Re-applying policies for existing tables (idempotent)
 *
 * Run this after: 002_enable_rls_policies.sql
 */

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PLATFORMS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "Platforms are viewable by everyone" ON platforms;
DROP POLICY IF EXISTS "Platforms can be created by service role only" ON platforms;
DROP POLICY IF EXISTS "Platforms can be updated by service role only" ON platforms;
DROP POLICY IF EXISTS "Platforms can be deleted by service role only" ON platforms;

-- Anyone can read platforms (public reference data)
CREATE POLICY "Platforms are viewable by everyone"
  ON platforms FOR SELECT
  USING (true);

-- Only service role can modify platforms (via backend)
CREATE POLICY "Platforms can be created by service role only"
  ON platforms FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Platforms can be updated by service role only"
  ON platforms FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Platforms can be deleted by service role only"
  ON platforms FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- APP_USERS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "Users are viewable by everyone" ON app_users;
DROP POLICY IF EXISTS "Users can view their own profile" ON app_users;
DROP POLICY IF EXISTS "Users can be created by service role only" ON app_users;
DROP POLICY IF EXISTS "Users can be updated by service role only" ON app_users;
DROP POLICY IF EXISTS "Users can be deleted by service role only" ON app_users;

-- Anyone can view user profiles (for displaying in sessions, participant lists)
-- This is public profile information like username, display name
CREATE POLICY "Users are viewable by everyone"
  ON app_users FOR SELECT
  USING (true);

-- Only service role can create users (via backend OAuth)
CREATE POLICY "Users can be created by service role only"
  ON app_users FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Only service role can update users (via backend)
CREATE POLICY "Users can be updated by service role only"
  ON app_users FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Only service role can delete users (via backend)
CREATE POLICY "Users can be deleted by service role only"
  ON app_users FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check that RLS is enabled on all tables
DO $$
DECLARE
  rec RECORD;
  missing_rls TEXT[] := '{}';
BEGIN
  FOR rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('games', 'sessions', 'session_participants', 'session_invites', 'user_platforms', 'platforms', 'app_users')
      AND NOT rowsecurity
  LOOP
    missing_rls := array_append(missing_rls, rec.tablename);
  END LOOP;

  IF array_length(missing_rls, 1) > 0 THEN
    RAISE WARNING 'RLS is still disabled on tables: %', array_to_string(missing_rls, ', ');
  ELSE
    RAISE NOTICE '✅ RLS enabled on all tables';
  END IF;
END $$;

-- Count policies per table
DO $$
DECLARE
  rec RECORD;
  expected_policies INTEGER;
  actual_policies INTEGER;
BEGIN
  RAISE NOTICE '=== Policy Count Summary ===';

  FOR rec IN
    SELECT
      t.tablename,
      COUNT(p.policyname) as policy_count
    FROM pg_tables t
    LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
    WHERE t.schemaname = 'public'
      AND t.tablename IN ('games', 'sessions', 'session_participants', 'session_invites', 'user_platforms', 'platforms', 'app_users')
    GROUP BY t.tablename
    ORDER BY t.tablename
  LOOP
    expected_policies := CASE rec.tablename
      WHEN 'games' THEN 4
      WHEN 'sessions' THEN 6
      WHEN 'session_participants' THEN 6
      WHEN 'session_invites' THEN 5
      WHEN 'user_platforms' THEN 4
      WHEN 'platforms' THEN 4
      WHEN 'app_users' THEN 4
      ELSE 0
    END;

    IF rec.policy_count = expected_policies THEN
      RAISE NOTICE '✅ %: % policies', rec.tablename, rec.policy_count;
    ELSE
      RAISE WARNING '❌ %: % policies (expected %)', rec.tablename, rec.policy_count, expected_policies;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- NOTES
-- ============================================================================

/*
SECURITY NOTES:

1. app_users table:
   - Contains Roblox profile data (username, display name, profile URL)
   - All fields are considered public profile information
   - Users can view all profiles (needed for participant lists, session hosts)
   - Only backend (service role) can modify user data
   - No sensitive data like tokens or passwords stored here

2. platforms table:
   - Reference/lookup table for supported platforms (Roblox, Discord, etc.)
   - Completely public read-only data from user perspective
   - Only backend can add/modify platforms

3. Service Role:
   - Backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS
   - Never expose service role key to clients
   - All write operations go through backend with proper validation

4. Testing:
   - Use SUPABASE_ANON_KEY from client to verify RLS enforcement
   - Test that unauthenticated users can read public data
   - Test that authenticated users cannot directly modify data
*/
