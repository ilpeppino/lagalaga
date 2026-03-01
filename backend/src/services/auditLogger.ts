/**
 * Audit Logger Service
 *
 * Provides immutable append-only audit trail for sensitive operations.
 * Used for compliance (COPPA, GDPR) and security monitoring.
 */

import type { FastifyRequest } from 'fastify';
import { getSupabase } from '../config/supabase.js';

export interface AuditLogEntry {
  actor_id: string | null;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  outcome: 'success' | 'failure';
  error_message?: string;
}

/**
 * Log a sensitive operation to the audit trail
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('audit_logs').insert([
      {
        actor_id: entry.actor_id,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        metadata: entry.metadata,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        outcome: entry.outcome,
        error_message: entry.error_message,
      },
    ]);

    if (error) {
      // Log the failure but don't throw (audit logging failure should not block operations)
      console.error('[AUDIT LOG ERROR]', { error: error.message, entry });
    }
  } catch (err) {
    // Log the failure but don't throw
    console.error('[AUDIT LOG ERROR]', { error: err instanceof Error ? err.message : String(err) });
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
