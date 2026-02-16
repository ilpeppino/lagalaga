-- Verification script for user_stats_achievements migration
-- Run this after applying 20260216113146_user_stats_achievements.sql

\echo '=========================================='
\echo 'Verifying user_stats and user_achievements tables'
\echo '=========================================='
\echo ''

-- Check user_stats table exists
\echo 'Checking user_stats table...'
SELECT
  'user_stats' AS table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_stats'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END AS status;

-- Check user_achievements table exists
\echo 'Checking user_achievements table...'
SELECT
  'user_achievements' AS table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_achievements'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END AS status;

-- Verify user_stats columns
\echo 'Verifying user_stats columns...'
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_stats'
ORDER BY ordinal_position;

-- Verify user_achievements columns
\echo 'Verifying user_achievements columns...'
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_achievements'
ORDER BY ordinal_position;

-- Check indexes
\echo 'Checking indexes...'
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('user_stats', 'user_achievements')
ORDER BY tablename, indexname;

-- Check RLS is enabled
\echo 'Checking RLS status...'
SELECT
  schemaname,
  tablename,
  CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user_stats', 'user_achievements')
ORDER BY tablename;

-- Check RLS policies
\echo 'Checking RLS policies...'
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual LIKE '%service_role%' THEN '✅ Service role policy'
    ELSE 'Other policy'
  END AS policy_type
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('user_stats', 'user_achievements')
ORDER BY tablename, policyname;

-- Check constraints
\echo 'Checking constraints...'
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid IN ('user_stats'::regclass, 'user_achievements'::regclass)
ORDER BY conrelid, contype, conname;

\echo ''
\echo '=========================================='
\echo 'Verification complete!'
\echo '=========================================='
