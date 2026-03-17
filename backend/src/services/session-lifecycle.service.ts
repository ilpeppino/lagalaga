import { createSessionLifecycleRepository } from '../db/repository-factory.js';
import { logger } from '../lib/logger.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import type { SessionLifecycleRepository } from '../db/repositories/session-lifecycle.repository.js';

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
  private repositoryInstance: SessionLifecycleRepository | null = null;
  private archivedColumnAvailable: boolean | null = null;

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

  private get repository(): SessionLifecycleRepository {
    if (!this.repositoryInstance) {
      this.repositoryInstance = createSessionLifecycleRepository();
    }
    return this.repositoryInstance;
  }

  private isMissingArchivedAtColumn(error: { message?: string } | null | undefined): boolean {
    const message = error?.message ?? '';
    return /archived_at/i.test(message) && /column/i.test(message);
  }

  private staleActiveCutoffIso(now: Date): string {
    return new Date(now.getTime() - this.autoCompleteAfterHours * 60 * 60 * 1000).toISOString();
  }

  private completedRetentionCutoffIso(now: Date): string {
    return new Date(now.getTime() - this.completedRetentionHours * 60 * 60 * 1000).toISOString();
  }

  private async resolveArchivedColumnAvailability(): Promise<boolean> {
    if (this.archivedColumnAvailable !== null) {
      return this.archivedColumnAvailable;
    }

    const { data, error } = await this.repository.hasArchivedAtColumn();
    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to inspect sessions schema for archived_at column: ${error.message}`
      );
    }

    this.archivedColumnAvailable = data;
    return data ?? [];
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
    const { data, error } = await this.repository.findStaleActiveSessionIds(cutoffIso, this.batchSize);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to find stale active sessions: ${error.message}`
      );
    }

    return data ?? [];
  }

  private async autoCompleteSessions(sessionIds: string[], nowIso: string): Promise<number> {
    if (sessionIds.length === 0) return 0;

    const { data, error } = await this.repository.autoCompleteSessions(sessionIds, nowIso);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to auto-complete sessions: ${error.message}`);
    }

    return data;
  }

  private async findStaleCompletedSessionIds(cutoffIso: string): Promise<string[]> {
    const useArchivedAtFilter = await this.resolveArchivedColumnAvailability();
    let { data, error } = await this.repository.findStaleCompletedSessionIds(
      cutoffIso,
      this.batchSize,
      useArchivedAtFilter
    );

    if (error && useArchivedAtFilter && this.isMissingArchivedAtColumn(error)) {
      this.archivedColumnAvailable = false;
      logger.warn(
        { error: error.message },
        'sessions.archived_at not available yet; skipping archival filter in lifecycle job'
      );
      ({ data, error } = await this.repository.findStaleCompletedSessionIds(
        cutoffIso,
        this.batchSize,
        false
      ));
    }

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to find retention-expired completed sessions: ${error.message}`
      );
    }

    return data ?? [];
  }

  private async archiveCompletedSessions(sessionIds: string[], nowIso: string): Promise<number> {
    if (sessionIds.length === 0) return 0;

    const useArchivedAtColumn = await this.resolveArchivedColumnAvailability();
    let { data, error } = await this.repository.archiveCompletedSessions(
      sessionIds,
      nowIso,
      useArchivedAtColumn
    );

    if (error && useArchivedAtColumn && this.isMissingArchivedAtColumn(error)) {
      this.archivedColumnAvailable = false;
      logger.warn(
        { error: error.message },
        'sessions.archived_at not available yet; falling back to status=cancelled archival'
      );
      ({ data, error } = await this.repository.archiveCompletedSessions(
        sessionIds,
        nowIso,
        false
      ));
    }

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to archive completed sessions by retention policy: ${error.message}`
      );
    }

    return data ?? 0;
  }
}
