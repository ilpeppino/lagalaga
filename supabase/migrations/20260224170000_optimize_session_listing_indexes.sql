/*
 * Issue #7: Missing Critical Database Indexes
 *
 * Existing indexes cover basic filtering but do not fully match the current
 * session listing sort order and archival filter used by optimized RPCs:
 *   ORDER BY scheduled_start [ASC|DESC] NULLS LAST, created_at DESC
 *   WHERE archived_at IS NULL
 */

-- Supports list_sessions_optimized/listSessionsFallback for active + scheduled sessions
-- with ORDER BY scheduled_start DESC NULLS LAST, created_at DESC.
CREATE INDEX IF NOT EXISTS idx_sessions_status_sched_created_unarchived
  ON public.sessions(status, scheduled_start DESC NULLS LAST, created_at DESC)
  WHERE status IN ('active', 'scheduled')
    AND archived_at IS NULL;

-- Supports list_user_planned_sessions_optimized/listUserPlannedSessionsFallback for
-- host-scoped planned sessions with ORDER BY scheduled_start ASC NULLS LAST, created_at DESC.
CREATE INDEX IF NOT EXISTS idx_sessions_host_status_sched_created_unarchived
  ON public.sessions(host_id, status, scheduled_start ASC NULLS LAST, created_at DESC)
  WHERE status IN ('scheduled', 'active')
    AND archived_at IS NULL;
