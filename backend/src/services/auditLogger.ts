/**
 * Audit Logger Service
 *
 * Provides immutable append-only audit trail for sensitive operations.
 * Used for compliance (COPPA, GDPR) and security monitoring.
 */

import type { FastifyRequest } from 'fastify';
import type { AuditLogEntry } from '../db/repositories/audit.repository.js';
import { createAuditRepository } from '../db/repository-factory.js';
import { logger } from '../lib/logger.js';
import { withRetry } from '../lib/errorRecovery.js';
import { metrics } from '../plugins/metrics.js';

async function insertAuditEntry(entry: AuditLogEntry): Promise<void> {
  const repository = createAuditRepository();
  const { error } = await repository.insert(entry);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Log a sensitive operation to the audit trail.
 * Transient failures are retried up to 3 times with exponential backoff.
 * Persistent failures are tracked in metrics and logged — never thrown.
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await withRetry(() => insertAuditEntry(entry), {
      maxAttempts: 3,
      baseDelayMs: 200,
    });
  } catch (err) {
    // All retry attempts exhausted — record metric and log for alerting
    metrics.incrementCounter('audit_log_failures_total', { action: entry.action });
    logger.error(
      { error: err instanceof Error ? err.message : String(err), entry },
      'Audit log insert failed after retries'
    );
  }
}

/**
 * Helper to create audit log entry from request context
 */
export function createAuditLogEntry(
  request: FastifyRequest,
  action: string,
  outcome: 'success' | 'failure',
  details?: Partial<AuditLogEntry>
): AuditLogEntry {
  return {
    actor_id: (request as any).user?.id || null,
    action,
    outcome,
    ip_address: request.ip,
    user_agent: request.headers['user-agent'],
    ...details,
  };
}

/**
 * Standard audit log actions
 */
export const AUDIT_ACTIONS = {
  // Account management
  ACCOUNT_DELETE_REQUESTED: 'account.delete_requested',
  ACCOUNT_DELETE_COMPLETED: 'account.delete_completed',
  ACCOUNT_DELETE_FAILED: 'account.delete_failed',
  ACCOUNT_DELETE_CANCELED: 'account.delete_canceled',

  // Authentication
  AUTH_LOGOUT: 'auth.logout',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  OAUTH_TOKEN_ISSUED: 'oauth.token_issued',
  OAUTH_TOKEN_REFRESHED: 'oauth.token_refreshed',
  OAUTH_ACCOUNT_LINKED: 'oauth.account_linked',
  OAUTH_ACCOUNT_UNLINKED: 'oauth.account_unlinked',

  // Safety & Reports
  REPORT_SUBMITTED: 'report.submitted',
  REPORT_ESCALATED: 'report.escalated',
  REPORT_STATUS_CHANGED: 'report.status_changed',

  // Sessions
  SESSION_CREATED: 'session.created',
  SESSION_DELETED: 'session.deleted',

  // Suspicious activity
  SUSPICIOUS_ACTIVITY: 'suspicious.activity',
  RATE_LIMIT_EXCEEDED: 'rate_limit.exceeded',
  AUTH_FAILURE: 'auth.failure',
} as const;

/**
 * Convenience function to log account deletion
 */
export async function logAccountDeletion(
  request: FastifyRequest,
  userId: string,
  reason?: string,
  outcome: 'success' | 'failure' = 'success',
  errorMessage?: string
): Promise<void> {
  await logAuditEvent(
    createAuditLogEntry(request, AUDIT_ACTIONS.ACCOUNT_DELETE_REQUESTED, outcome, {
      resource_type: 'account',
      resource_id: userId,
      metadata: { reason },
      error_message: errorMessage,
    })
  );
}

/**
 * Convenience function to log OAuth operations
 */
export async function logOAuthOperation(
  request: FastifyRequest,
  action: 'issued' | 'refreshed' | 'linked' | 'unlinked',
  userId: string,
  provider: string,
  outcome: 'success' | 'failure' = 'success',
  errorMessage?: string
): Promise<void> {
  const actionMap: Record<string, string> = {
    issued: AUDIT_ACTIONS.OAUTH_TOKEN_ISSUED,
    refreshed: AUDIT_ACTIONS.OAUTH_TOKEN_REFRESHED,
    linked: AUDIT_ACTIONS.OAUTH_ACCOUNT_LINKED,
    unlinked: AUDIT_ACTIONS.OAUTH_ACCOUNT_UNLINKED,
  };

  await logAuditEvent(
    createAuditLogEntry(request, actionMap[action] || AUDIT_ACTIONS.OAUTH_TOKEN_ISSUED, outcome, {
      resource_type: 'oauth_token',
      resource_id: userId,
      metadata: { provider },
      error_message: errorMessage,
    })
  );
}

/**
 * Convenience function to log report submission
 */
export async function logReportSubmission(
  request: FastifyRequest,
  reportId: string,
  category: string,
  targetUserId?: string,
  outcome: 'success' | 'failure' = 'success',
  errorMessage?: string
): Promise<void> {
  await logAuditEvent(
    createAuditLogEntry(request, AUDIT_ACTIONS.REPORT_SUBMITTED, outcome, {
      resource_type: 'report',
      resource_id: reportId,
      metadata: { category, target_user_id: targetUserId },
      error_message: errorMessage,
    })
  );
}
