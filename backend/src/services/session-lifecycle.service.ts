import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

interface SessionLifecycleServiceOptions {
  autoCompleteAfterHours?: number;
  completedRetentionHours?: number;
  batchSize?: number;
}

export interface SessionLifecycleRunResult {
  autoCompletedCount: number;
  archivedCompletedCount: number;
  checkedAt: string;
}

const DEFAULT_AUTO_COMPLETE_AFTER_HOURS = 2;
const DEFAULT_COMPLETED_RETENTION_HOURS = 2;
const DEFAULT_BATCH_SIZE = 200;

function clampPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < 1) return fallback;
  return rounded;
}

export class SessionLifecycleService {
  private readonly autoCompleteAfterHours: number;
  private readonly completedRetentionHours: number;
  private readonly batchSize: number;

  constructor(options: SessionLifecycleServiceOptions = {}) {
    this.autoCompleteAfterHours = clampPositiveInt(
      options.autoCompleteAfterHours ?? DEFAULT_AUTO_COMPLETE_AFTER_HOURS,
      DEFAULT_AUTO_COMPLETE_AFTER_HOURS
    );
    this.completedRetentionHours = clampPositiveInt(
      options.completedRetentionHours ?? DEFAULT_COMPLETED_RETENTION_HOURS,
      DEFAULT_COMPLETED_RETENTION_HOURS
    );
    this.batchSize = clampPositiveInt(options.batchSize ?? DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  }

  private staleActiveCutoffIso(now: Date): string {
    return new Date(now.getTime() - this.autoCompleteAfterHours * 60 * 60 * 1000).toISOString();
  }

  private completedRetentionCutoffIso(now: Date): string {
    return new Date(now.getTime() - this.completedRetentionHours * 60 * 60 * 1000).toISOString();
  }

  async processLifecycle(now: Date = new Date()): Promise<SessionLifecycleRunResult> {
    const nowIso = now.toISOString();

    const staleActiveIds = await this.findStaleActiveSessionIds(this.staleActiveCutoffIso(now));
    const autoCompletedCount = await this.autoCompleteSessions(staleActiveIds, nowIso);

    const staleCompletedIds = await this.findStaleCompletedSessionIds(this.completedRetentionCutoffIso(now));
    const archivedCompletedCount = await this.archiveCompletedSessions(staleCompletedIds, nowIso);

    return {
      autoCompletedCount,
      archivedCompletedCount,
      checkedAt: nowIso,
    };
  }

  private async findStaleActiveSessionIds(cutoffIso: string): Promise<string[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('status', 'active')
      .or(`scheduled_start.lte.${cutoffIso},and(scheduled_start.is.null,created_at.lte.${cutoffIso})`)
      .limit(this.batchSize);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to find stale active sessions: ${error.message}`
      );
    }

    return (data ?? []).map((row: { id: string }) => row.id);
  }

  private async autoCompleteSessions(sessionIds: string[], nowIso: string): Promise<number> {
    if (sessionIds.length === 0) return 0;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        scheduled_end: nowIso,
        updated_at: nowIso,
      })
      .in('id', sessionIds)
      .eq('status', 'active')
      .select('id');

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to auto-complete sessions: ${error.message}`);
    }

    return Array.isArray(data) ? data.length : sessionIds.length;
  }

  private async findStaleCompletedSessionIds(cutoffIso: string): Promise<string[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('status', 'completed')
      .is('archived_at', null)
      .lte('updated_at', cutoffIso)
      .limit(this.batchSize);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to find retention-expired completed sessions: ${error.message}`
      );
    }

    return (data ?? []).map((row: { id: string }) => row.id);
  }

  private async archiveCompletedSessions(sessionIds: string[], nowIso: string): Promise<number> {
    if (sessionIds.length === 0) return 0;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sessions')
      .update({
        archived_at: nowIso,
        updated_at: nowIso,
      })
      .in('id', sessionIds)
      .eq('status', 'completed')
      .is('archived_at', null)
      .select('id');

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to archive completed sessions by retention policy: ${error.message}`
      );
    }

    return Array.isArray(data) ? data.length : sessionIds.length;
  }
}
