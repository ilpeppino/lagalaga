-- Schema Verification Script
-- Run this after executing all migrations to verify the database schema

\echo '========================================'
\echo 'Schema Verification'
\echo '========================================'
\echo ''

\echo '=== Tables ==='
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

\echo ''
\echo '=== Row Level Security Status ==='
SELECT
  schemaname,
  tablename,
  CASE WHEN rowsecurity THEN '✅ Enabled' ELSE '❌ Disabled' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

\echo ''
\echo '=== Policy Count by Table ==='
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo '=== Enums ==='
SELECT
  t.typname as enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

\echo ''
\echo '=== Foreign Keys ==='
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo '=== Expected Tables ==='
\echo 'The following tables should exist:'
\echo '  ✓ app_users'
\echo '  ✓ friendships'
\echo '  ✓ games'
\echo '  ✓ platforms'
\echo '  ✓ roblox_experience_cache'
\echo '  ✓ roblox_friends_cache'
\echo '  ✓ session_invites'
\echo '  ✓ session_participants'
\echo '  ✓ sessions'
\echo '  ✓ user_platforms'
\echo ''
