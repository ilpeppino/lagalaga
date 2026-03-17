import { createAccountDeletionRepository } from '../db/repository-factory.js';
import { logger } from '../lib/logger.js';
import { sanitize } from '../lib/sanitizer.js';
import { AppError, ErrorCodes, NotFoundError, RateLimitError } from '../utils/errors.js';
import type {
  AccountDeletionRepository,
  AccountDeletionRequestRow,
  DeletionInitiator,
  DeletionRequestStatus,
} from '../db/repositories/account-deletion.repository.js';
export type { DeletionInitiator, DeletionRequestStatus };

export type AccountStatus = 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';

export interface DeletionStatusResponse {
  requestId: string | null;
  status: AccountStatus | DeletionRequestStatus;
  requestedAt: string | null;
  scheduledPurgeAt: string | null;
  completedAt: string | null;
  retentionSummary: string;
}

interface CreateDeletionRequestInput {
  userId: string;
  initiator: DeletionInitiator;
  reason?: string;
}

interface ServiceOptions {
  gracePeriodDays?: number;
  maxRequestsPerHour?: number;
}

export class AccountDeletionService {
  private accountDeletionRepositoryInstance: AccountDeletionRepository | null = null;
  private readonly gracePeriodDays: number;
  private readonly maxRequestsPerHour: number;

  constructor(options: ServiceOptions = {}) {
    this.gracePeriodDays = options.gracePeriodDays ?? 7;
    this.maxRequestsPerHour = options.maxRequestsPerHour ?? 3;
  }

  private get accountDeletionRepository(): AccountDeletionRepository {
    if (!this.accountDeletionRepositoryInstance) {
      this.accountDeletionRepositoryInstance = createAccountDeletionRepository();
    }
    return this.accountDeletionRepositoryInstance;
  }

  private retentionSummary(): string {
    return 'Certain security logs and legally required records may be retained where required by law.';
  }

  private buildScheduledPurgeAt(requestedAt: Date): string {
    const scheduled = new Date(requestedAt);
    scheduled.setUTCDate(scheduled.getUTCDate() + this.gracePeriodDays);
    return scheduled.toISOString();
  }

  async createDeletionRequest(input: CreateDeletionRequestInput): Promise<DeletionStatusResponse> {
    const existingPending = await this.getPendingRequest(input.userId);
    if (existingPending) {
      return {
        requestId: existingPending.id,
        status: existingPending.status,
        requestedAt: existingPending.requested_at,
        scheduledPurgeAt: existingPending.scheduled_purge_at,
        completedAt: null,
        retentionSummary: this.retentionSummary(),
      };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: count, error: countError } = await this.accountDeletionRepository.countRecentRequests(
      input.userId,
      oneHourAgo
    );

    if (countError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to check rate limit: ${countError.message}`);
    }

    if ((count ?? 0) >= this.maxRequestsPerHour) {
      throw new RateLimitError('Too many deletion requests. Please try again later.');
    }

    const requestedAt = new Date();
    const scheduledPurgeAt = this.buildScheduledPurgeAt(requestedAt);

    const { data: row, error: insertError } = await this.accountDeletionRepository.createDeletionRequest({
      userId: input.userId,
      requestedAtIso: requestedAt.toISOString(),
      scheduledPurgeAtIso: scheduledPurgeAt,
      initiator: input.initiator,
      reason: input.reason ?? null,
    });

    if (insertError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to create deletion request: ${insertError.message}`);
    }

    const { error: userUpdateError } = await this.accountDeletionRepository.updateUserPendingDeletion(
      input.userId,
      new Date().toISOString()
    );

    if (userUpdateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to update user status: ${userUpdateError.message}`);
    }

    const { data: tokenVersion, error: userFetchError } = await this.accountDeletionRepository.getUserTokenVersion(input.userId);

    if (userFetchError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load user token version: ${userFetchError.message}`);
    }

    const { error: tokenVersionError } = await this.accountDeletionRepository.incrementUserTokenVersion(
      input.userId,
      tokenVersion
    );

    if (tokenVersionError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to revoke tokens: ${tokenVersionError.message}`);
    }

    const { error: platformTokenRevokeError } = await this.accountDeletionRepository.clearRobloxPlatformTokens(
      input.userId,
      new Date().toISOString()
    );

    if (platformTokenRevokeError) {
      logger.warn(
        sanitize({ userId: input.userId, error: platformTokenRevokeError.message }),
        'Failed to revoke Roblox platform tokens during deletion request'
      );
    }

    const { error: pushTokenDeleteError } = await this.accountDeletionRepository.deletePushTokens(input.userId);

    if (pushTokenDeleteError) {
      logger.warn(
        sanitize({ userId: input.userId, error: pushTokenDeleteError.message }),
        'Failed to delete push tokens during deletion request'
      );
    }

    return {
      requestId: row.id,
      status: row.status,
      requestedAt: row.requested_at,
      scheduledPurgeAt: row.scheduled_purge_at,
      completedAt: null,
      retentionSummary: this.retentionSummary(),
    };
  }

  async getDeletionStatus(userId: string): Promise<DeletionStatusResponse> {
    const { data: pendingOrLatest, error } = await this.accountDeletionRepository.getLatestRequest(userId);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch deletion status: ${error.message}`);
    }

    if (!pendingOrLatest) {
      return {
        requestId: null,
        status: 'ACTIVE',
        requestedAt: null,
        scheduledPurgeAt: null,
        completedAt: null,
        retentionSummary: this.retentionSummary(),
      };
    }

    return {
      requestId: pendingOrLatest.id,
      status: pendingOrLatest.status,
      requestedAt: pendingOrLatest.requested_at,
      scheduledPurgeAt: pendingOrLatest.scheduled_purge_at,
      completedAt: pendingOrLatest.completed_at,
      retentionSummary: this.retentionSummary(),
    };
  }

  async cancelDeletionRequest(userId: string): Promise<DeletionStatusResponse> {
    const pending = await this.getPendingRequest(userId);

    if (!pending) {
      throw new NotFoundError('Deletion request');
    }

    if (new Date(pending.scheduled_purge_at).getTime() <= Date.now()) {
      throw new AppError(ErrorCodes.CONFLICT, 'Deletion request can no longer be canceled', 409);
    }

    const nowIso = new Date().toISOString();

    const { error: requestUpdateError } = await this.accountDeletionRepository.cancelRequest(pending.id, nowIso);

    if (requestUpdateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to cancel deletion request: ${requestUpdateError.message}`);
    }

    const { data: userTokenVersion, error: userFetchError } = await this.accountDeletionRepository.getUserTokenVersion(userId);

    if (userFetchError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch user token version: ${userFetchError.message}`);
    }

    const { error: userUpdateError } = await this.accountDeletionRepository.restoreUserActive(
      userId,
      userTokenVersion + 1,
      nowIso
    );

    if (userUpdateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to restore account: ${userUpdateError.message}`);
    }

    return {
      requestId: pending.id,
      status: 'CANCELED',
      requestedAt: pending.requested_at,
      scheduledPurgeAt: pending.scheduled_purge_at,
      completedAt: null,
      retentionSummary: this.retentionSummary(),
    };
  }

  async processDueDeletionRequests(limit = 25): Promise<{ processed: number; failed: number }> {
    const nowIso = new Date().toISOString();

    const { data, error } = await this.accountDeletionRepository.listDuePendingRequests(nowIso, limit);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch pending deletion requests: ${error.message}`);
    }

    let processed = 0;
    let failed = 0;

    for (const row of data ?? []) {
      try {
        await this.executePurge(row);
        processed += 1;
      } catch (purgeError) {
        failed += 1;
        const message = purgeError instanceof Error ? purgeError.message : String(purgeError);

        await this.accountDeletionRepository.markRequestFailed(
          row.id,
          new Date().toISOString(),
          message.slice(0, 1000)
        );

        logger.error(
          sanitize({ requestId: row.id, userId: row.user_id, error: message }),
          'Failed to execute account deletion purge'
        );
      }
    }

    return { processed, failed };
  }

  private async getPendingRequest(userId: string): Promise<AccountDeletionRequestRow | null> {
    const { data, error } = await this.accountDeletionRepository.findPendingRequest(userId);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch pending request: ${error.message}`);
    }

    return data ?? null;
  }

  private async executePurge(row: AccountDeletionRequestRow): Promise<void> {
    const nowIso = new Date().toISOString();
    const userId = row.user_id;

    logger.info(sanitize({ requestId: row.id, userId }), 'Starting account purge');

    const { error } = await this.accountDeletionRepository.purgeAccount(row.id, userId, nowIso);
    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to execute account purge: ${error.message}`);
    }

    logger.info(sanitize({ requestId: row.id, userId }), 'Account purge completed');
  }
}
