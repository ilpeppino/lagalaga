/*
 * Verification Script for Hybrid Friends Schema Migration
 *
 * Run this after applying 009_hybrid_friends_schema.sql
 */

-- ===========================================================================
-- Verify Tables Exist
-- ===========================================================================

DO $$
DECLARE
  v_table_count INTEGER;
BEGIN
  -- Check roblox_friends_cache
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'roblox_friends_cache';

  IF v_table_count = 0 THEN
    RAISE EXCEPTION 'Table roblox_friends_cache does not exist';
  ELSE
    RAISE NOTICE '✅ Table roblox_friends_cache exists';
  END IF;

  -- Check friendships
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'friendships';

  IF v_table_count = 0 THEN
    RAISE EXCEPTION 'Table friendships does not exist';
  ELSE
    RAISE NOTICE '✅ Table friendships exists';
  END IF;
END $$;

-- ===========================================================================
-- Verify Constraints
-- ===========================================================================

DO $$
DECLARE
  v_constraint_count INTEGER;
BEGIN
  -- roblox_friends_cache constraints
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'roblox_friends_cache'
    AND constraint_name = 'uq_roblox_friends_cache_user_friend';

  IF v_constraint_count = 0 THEN
    RAISE WARNING '⚠️  Missing constraint: uq_roblox_friends_cache_user_friend';
  ELSE
    RAISE NOTICE '✅ Constraint uq_roblox_friends_cache_user_friend exists';
  END IF;

  -- friendships constraints
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'friendships'
    AND constraint_name = 'chk_friendships_canonical_order';

  IF v_constraint_count = 0 THEN
    RAISE WARNING '⚠️  Missing constraint: chk_friendships_canonical_order';
  ELSE
    RAISE NOTICE '✅ Constraint chk_friendships_canonical_order exists';
  END IF;

  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'friendships'
    AND constraint_name = 'chk_friendships_status';

  IF v_constraint_count = 0 THEN
    RAISE WARNING '⚠️  Missing constraint: chk_friendships_status';
  ELSE
    RAISE NOTICE '✅ Constraint chk_friendships_status exists';
  END IF;

  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'friendships'
    AND constraint_name = 'uq_friendships_user_friend';

  IF v_constraint_count = 0 THEN
    RAISE WARNING '⚠️  Missing constraint: uq_friendships_user_friend';
  ELSE
    RAISE NOTICE '✅ Constraint uq_friendships_user_friend exists';
  END IF;
END $$;

-- ===========================================================================
-- Verify Indexes
-- ===========================================================================

DO $$
DECLARE
  v_index_count INTEGER;
BEGIN
  -- roblox_friends_cache indexes
  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'roblox_friends_cache'
    AND indexname = 'idx_roblox_friends_cache_roblox_user_id';

  IF v_index_count = 0 THEN
    RAISE WARNING '⚠️  Missing index: idx_roblox_friends_cache_roblox_user_id';
  ELSE
    RAISE NOTICE '✅ Index idx_roblox_friends_cache_roblox_user_id exists';
  END IF;

  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'roblox_friends_cache'
    AND indexname = 'idx_roblox_friends_cache_user_synced';

  IF v_index_count = 0 THEN
    RAISE WARNING '⚠️  Missing index: idx_roblox_friends_cache_user_synced';
  ELSE
    RAISE NOTICE '✅ Index idx_roblox_friends_cache_user_synced exists';
  END IF;

  -- friendships indexes
  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'friendships'
    AND indexname = 'idx_friendships_user_status';

  IF v_index_count = 0 THEN
    RAISE WARNING '⚠️  Missing index: idx_friendships_user_status';
  ELSE
    RAISE NOTICE '✅ Index idx_friendships_user_status exists';
  END IF;

  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'friendships'
    AND indexname = 'idx_friendships_friend_status';

  IF v_index_count = 0 THEN
    RAISE WARNING '⚠️  Missing index: idx_friendships_friend_status';
  ELSE
    RAISE NOTICE '✅ Index idx_friendships_friend_status exists';
  END IF;

  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'friendships'
    AND indexname = 'idx_friendships_pending';

  IF v_index_count = 0 THEN
    RAISE WARNING '⚠️  Missing index: idx_friendships_pending';
  ELSE
    RAISE NOTICE '✅ Index idx_friendships_pending exists';
  END IF;
END $$;

-- ===========================================================================
-- Verify RLS
-- ===========================================================================

DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_policy_count INTEGER;
BEGIN
  -- Check RLS on roblox_friends_cache
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'roblox_friends_cache'
    AND relnamespace = 'public'::regnamespace;

  IF NOT v_rls_enabled THEN
    RAISE WARNING '⚠️  RLS not enabled on roblox_friends_cache';
  ELSE
    RAISE NOTICE '✅ RLS enabled on roblox_friends_cache';
  END IF;

  -- Check RLS policies on roblox_friends_cache
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'roblox_friends_cache';

  IF v_policy_count = 0 THEN
    RAISE WARNING '⚠️  No RLS policies on roblox_friends_cache';
  ELSE
    RAISE NOTICE '✅ % RLS policies on roblox_friends_cache', v_policy_count;
  END IF;

  -- Check RLS on friendships
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'friendships'
    AND relnamespace = 'public'::regnamespace;

  IF NOT v_rls_enabled THEN
    RAISE WARNING '⚠️  RLS not enabled on friendships';
  ELSE
    RAISE NOTICE '✅ RLS enabled on friendships';
  END IF;

  -- Check RLS policies on friendships
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'friendships';

  IF v_policy_count = 0 THEN
    RAISE WARNING '⚠️  No RLS policies on friendships';
  ELSE
    RAISE NOTICE '✅ % RLS policies on friendships', v_policy_count;
  END IF;
END $$;

-- ===========================================================================
-- Test Canonical Ordering Constraint
-- ===========================================================================

DO $$
DECLARE
  v_test_user_1 UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_test_user_2 UUID := '00000000-0000-0000-0000-000000000002'::uuid;
  v_error_caught BOOLEAN := FALSE;
BEGIN
  -- Try to insert with user_id > friend_id (should fail)
  BEGIN
    INSERT INTO friendships (user_id, friend_id, initiated_by)
    VALUES (v_test_user_2, v_test_user_1, v_test_user_2);
  EXCEPTION
    WHEN check_violation THEN
      v_error_caught := TRUE;
      RAISE NOTICE '✅ Canonical ordering constraint working (rejected user_id > friend_id)';
  END;

  IF NOT v_error_caught THEN
    RAISE WARNING '⚠️  Canonical ordering constraint NOT working';
    -- Clean up test data
    DELETE FROM friendships WHERE user_id = v_test_user_2 AND friend_id = v_test_user_1;
  END IF;
END $$;

-- ===========================================================================
-- Summary
-- ===========================================================================

SELECT
  'Migration Verification Complete' AS status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('roblox_friends_cache', 'friendships')) AS tables_created,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('roblox_friends_cache', 'friendships')) AS indexes_created,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('roblox_friends_cache', 'friendships')) AS rls_policies_created;
