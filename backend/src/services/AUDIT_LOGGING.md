# Audit Logging

## Overview

The audit logging system provides an immutable append-only audit trail for sensitive operations. This is critical for:
- COPPA (Children's Online Privacy Protection Act) compliance
- GDPR compliance
- Security monitoring and incident response
- User accountability and data governance

## Architecture

### Database Schema

The `audit_logs` table is created by migration `20260301000000_create_audit_logs.sql` with:
- Immutable append-only design (inserts only, no updates/deletes)
- RLS policies for user privacy (users see only their own audit logs)
- Service role has full access for admin/monitoring
- Indexes on actor, action, resource type, and timestamp for efficient queries
- Dedicated index on failures for security monitoring

### Service

The `auditLogger.ts` service provides:
- `logAuditEvent()` — low-level function to insert audit entries
- `createAuditLogEntry()` — helper to populate request context (IP, user agent, user ID)
- Convenience functions for common operations
- Predefined action constants

## Usage

### Basic Usage

```typescript
import { logAuditEvent, createAuditLogEntry, AUDIT_ACTIONS } from '../services/auditLogger.js';

// In your route handler
await logAuditEvent(
  createAuditLogEntry(request, AUDIT_ACTIONS.ACCOUNT_DELETE_REQUESTED, 'success', {
    resource_type: 'account',
    resource_id: userId,
    metadata: { reason: 'User requested deletion' },
  })
);
```

### Account Deletion

```typescript
import { logAccountDeletion } from '../services/auditLogger.js';

// Log successful deletion request
await logAccountDeletion(request, userId, 'User requested deletion', 'success');

// Log failed deletion
await logAccountDeletion(
  request,
  userId,
  'User requested deletion',
  'failure',
  'Database error: ...'
);
```

### OAuth Operations

```typescript
import { logOAuthOperation } from '../services/auditLogger.js';

// Token issued
await logOAuthOperation(request, 'issued', userId, 'google', 'success');

// Token refreshed
await logOAuthOperation(request, 'refreshed', userId, 'roblox', 'success');

// Account linked
await logOAuthOperation(request, 'linked', userId, 'apple', 'success');

// Account linking failed
await logOAuthOperation(
  request,
  'linked',
  userId,
  'google',
  'failure',
  'Invalid token'
);
```

### Report Submission

```typescript
import { logReportSubmission } from '../services/auditLogger.js';

// Log successful report
await logReportSubmission(
  request,
  reportId,
  'HARASSMENT_OR_ABUSIVE_BEHAVIOR',
  targetUserId,
  'success'
);

// Log failed report
await logReportSubmission(
  request,
  reportId,
  'CSAM',
  undefined,
  'failure',
  'Validation error: description too short'
);
```

### Custom Actions

```typescript
import { logAuditEvent } from '../services/auditLogger.js';

// Define custom action
const customAction = 'notification.preferences_changed';

await logAuditEvent({
  actor_id: userId,
  action: customAction,
  resource_type: 'notification_preferences',
  resource_id: userId,
  metadata: {
    previous_state: { sessions_enabled: true },
    new_state: { sessions_enabled: false },
  },
  outcome: 'success',
  ip_address: request.ip,
  user_agent: request.headers['user-agent'],
});
```

## Standard Actions

Defined in `AUDIT_ACTIONS` constant:

### Account Management
- `account.delete_requested` — User initiated account deletion
- `account.delete_completed` — Account deletion completed
- `account.delete_failed` — Account deletion failed
- `account.delete_canceled` — User canceled deletion request

### Authentication
- `auth.logout` — User logged out
- `auth.login` — User logged in
- `auth.login_failed` — Login attempt failed
- `oauth.token_issued` — OAuth token generated
- `oauth.token_refreshed` — OAuth token refreshed
- `oauth.account_linked` — Account linked to OAuth provider
- `oauth.account_unlinked` — Account unlinked from OAuth provider

### Safety & Reports
- `report.submitted` — Safety report submitted
- `report.escalated` — Report escalated to moderation
- `report.status_changed` — Report status changed

### Sessions
- `session.created` — Gaming session created
- `session.deleted` — Gaming session deleted

### Suspicious Activity
- `suspicious.activity` — Suspicious activity detected
- `rate_limit.exceeded` — Rate limit exceeded
- `auth.failure` — Authentication failure

## Important Notes

### Error Handling

Audit logging failures do NOT block operations. If `logAuditEvent()` fails:
1. Error is logged to console (for observability)
2. Operation continues normally
3. User is unaffected

This prevents audit logging from becoming a bottleneck or breaking the application.

### Performance

- Audit log inserts are synchronous but fast (simple INSERT)
- Does not use transactions with business logic
- Indexes are optimized for read-heavy monitoring queries
- Consider async logging if scale becomes an issue

### Privacy

- Users can access their own audit logs via RLS policy
- Sensitive values in `metadata` are NOT automatically redacted
- Use the PII sanitizer if logging sensitive data
- Avoid logging plaintext passwords, tokens, or keys

### Querying Audit Logs

For admin monitoring (requires service_role):

```sql
-- Recent account deletions
SELECT * FROM audit_logs
WHERE action = 'account.delete_requested'
ORDER BY created_at DESC
LIMIT 100;

-- Recent failures
SELECT * FROM audit_logs
WHERE outcome = 'failure'
ORDER BY created_at DESC
LIMIT 50;

-- Suspicious activity by IP
SELECT ip_address, COUNT(*) as attempts
FROM audit_logs
WHERE action IN ('auth.login_failed', 'auth.failure')
  AND created_at > now() - interval '1 hour'
GROUP BY ip_address
ORDER BY attempts DESC;
```

## Integration Checklist

When implementing audit logging in a new service:

- [ ] Import `logAuditEvent`, `createAuditLogEntry`, and action constants
- [ ] Call `logAuditEvent()` after successful sensitive operations
- [ ] Log failures with `outcome: 'failure'` and error message
- [ ] Include `resource_type` and `resource_id` for tracking
- [ ] Add relevant metadata (provider, category, reason, etc.)
- [ ] Consider sensitive data in metadata (use sanitizer if needed)
- [ ] Test that failures are properly logged
- [ ] Document what operations are audited

## Examples

### Account Deletion Service Integration

```typescript
// In AccountDeletionService.createDeletionRequest()
try {
  const result = await db.from('account_deletion_requests').insert([...]);

  await logAccountDeletion(
    request,
    userId,
    body.reason,
    'success'
  );

  return result;
} catch (error) {
  await logAccountDeletion(
    request,
    userId,
    body.reason,
    'failure',
    error instanceof Error ? error.message : 'Unknown error'
  );
  throw error;
}
```

### Report Submission Integration

```typescript
// In reports route
try {
  const { data: report } = await supabase
    .from('reports')
    .insert([{ ... }])
    .select();

  await logReportSubmission(
    request,
    report.id,
    body.category,
    body.target_user_id,
    'success'
  );

  return report;
} catch (error) {
  await logReportSubmission(
    request,
    undefined,
    body.category,
    body.target_user_id,
    'failure',
    error instanceof Error ? error.message : 'Unknown error'
  );
  throw error;
}
```

## Future Enhancements

- [ ] Automatic audit logging via middleware for annotated routes
- [ ] Real-time alerting on suspicious activity
- [ ] Archive audit logs to immutable storage (S3, Cloud Storage)
- [ ] Monthly audit log reports for compliance
- [ ] Integration with security incident management tools
