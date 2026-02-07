/*
 * RLS Verification Script
 *
 * Run this script after applying 002_enable_rls_policies.sql
 * to verify that RLS is enabled and all policies are in place.
 */

-- ============================================================================
-- VERIFICATION 1: Check RLS is Enabled
-- ============================================================================

SELECT
  schemaname,
  tablename,
  CASE
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('games', 'sessions', 'session_participants', 'session_invites', 'user_platforms')
ORDER BY tablename;

-- Expected: All tables should show "✅ ENABLED"

-- ============================================================================
-- VERIFICATION 2: Count Policies Per Table
-- ============================================================================

SELECT
  tablename,
  COUNT(*) as policy_count,
  CASE tablename
    WHEN 'games' THEN 4
    WHEN 'sessions' THEN 6
    WHEN 'session_participants' THEN 6
    WHEN 'session_invites' THEN 5
    WHEN 'user_platforms' THEN 4
  END as expected_count,
  CASE
    WHEN COUNT(*) = CASE tablename
      WHEN 'games' THEN 4
      WHEN 'sessions' THEN 6
      WHEN 'session_participants' THEN 6
      WHEN 'session_invites' THEN 5
      WHEN 'user_platforms' THEN 4
    END THEN '✅ OK'
    ELSE '❌ MISMATCH'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Expected:
-- games: 4 policies
-- session_invites: 5 policies
-- session_participants: 6 policies
-- sessions: 6 policies
-- user_platforms: 4 policies

-- ============================================================================
-- VERIFICATION 3: List All Policies
-- ============================================================================

SELECT
  tablename,
  policyname,
  cmd as operation,
  CASE
    WHEN roles = '{public}' THEN 'public'
    WHEN roles = '{authenticated}' THEN 'authenticated'
    ELSE array_to_string(roles, ', ')
  END as applies_to
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- ============================================================================
-- VERIFICATION 4: Check Service Role Policy
-- ============================================================================

-- Count policies that allow service_role
SELECT
  tablename,
  COUNT(*) as service_role_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual::text LIKE '%service_role%'
    OR with_check::text LIKE '%service_role%'
  )
GROUP BY tablename
ORDER BY tablename;

-- Expected: All tables should have at least one service_role policy

-- ============================================================================
-- VERIFICATION 5: Summary Report
-- ============================================================================

WITH rls_status AS (
  SELECT
    COUNT(*) FILTER (WHERE rowsecurity) as enabled_count,
    COUNT(*) as total_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('games', 'sessions', 'session_participants', 'session_invites', 'user_platforms')
),
policy_count AS (
  SELECT COUNT(*) as total_policies
  FROM pg_policies
  WHERE schemaname = 'public'
)
SELECT
  r.enabled_count || ' / ' || r.total_tables as rls_enabled_tables,
  p.total_policies as total_policies_created,
  CASE
    WHEN r.enabled_count = r.total_tables AND p.total_policies >= 25
    THEN '✅ MIGRATION SUCCESSFUL'
    ELSE '❌ MIGRATION INCOMPLETE'
  END as overall_status
FROM rls_status r, policy_count p;

-- Expected: 5 / 5 tables, 31 policies, ✅ MIGRATION SUCCESSFUL

-- ============================================================================
-- VERIFICATION 6: Sample Policy Test (Optional)
-- ============================================================================

-- Test: Can we query public sessions without auth?
-- This should work if RLS is configured correctly

COMMENT ON TABLE sessions IS 'RLS verification: Public sessions should be queryable';

-- To test, run this in a session WITHOUT authentication:
-- SELECT COUNT(*) FROM sessions WHERE visibility = 'public';
-- Should return a count (not an error)

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

/*
If any verification fails:

1. RLS Not Enabled:
   ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

2. Missing Policies:
   Re-run 002_enable_rls_policies.sql

3. Policy Count Mismatch:
   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
   Compare with expected policies in migration file

4. Service Role Policies Missing:
   Check if migration was run with service role key
   Policies with auth.role() check require service role to create
*/
