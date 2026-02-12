/*
 * Rollback Migration: Remove Performance Indexes
 *
 * This migration removes all indexes added in 005_add_performance_indexes.sql
 * Use this only if you need to rollback the performance optimization migration.
 *
 * WARNING: Rolling back these indexes will significantly degrade query performance.
 * Only use this in emergencies or for testing purposes.
 */

-- ============================================================================
-- SESSIONS TABLE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_sessions_status_scheduled;
DROP INDEX IF EXISTS idx_sessions_host_status;
DROP INDEX IF EXISTS idx_sessions_created_at;
DROP INDEX IF EXISTS idx_sessions_place_status;

-- ============================================================================
-- SESSION_PARTICIPANTS TABLE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_session_participants_session_id;
DROP INDEX IF EXISTS idx_session_participants_user_state;
DROP INDEX IF EXISTS idx_session_participants_session_state;

-- ============================================================================
-- SESSION_INVITES TABLE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_session_invites_code;
DROP INDEX IF EXISTS idx_session_invites_session_id;
DROP INDEX IF EXISTS idx_session_invites_expired;

-- ============================================================================
-- USERS TABLE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_users_roblox_user_id;

-- ============================================================================
-- GAMES TABLE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_games_canonical_url;

-- ============================================================================
-- USER_PLATFORMS TABLE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_user_platforms_platform_user;
DROP INDEX IF EXISTS idx_user_platforms_user_id;
