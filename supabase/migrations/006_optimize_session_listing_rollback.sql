/*
 * Rollback Migration: Remove Optimized Session Listing Functions
 *
 * This migration removes the PostgreSQL functions created in
 * 006_optimize_session_listing.sql
 *
 * WARNING: Rolling back will revert to N+1 query pattern (41 queries instead of 1)
 * Only use this in emergencies or for testing purposes.
 */

-- Drop the optimized functions
DROP FUNCTION IF EXISTS list_sessions_optimized(TEXT, TEXT, INT, UUID, INT, INT);
DROP FUNCTION IF EXISTS list_user_planned_sessions_optimized(UUID, INT, INT);
