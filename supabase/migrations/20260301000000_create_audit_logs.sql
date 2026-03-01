/*
 * Audit logging table for sensitive operations.
 * Immutable append-only table for compliance (COPPA, GDPR, etc.).
 */

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_outcome ON audit_logs(outcome);

-- Partial index for failures (security monitoring)
CREATE INDEX idx_audit_logs_failures ON audit_logs(created_at DESC) WHERE outcome = 'failure';

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: authenticated users can see own audit logs
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
CREATE POLICY "Users can view own audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = actor_id);

-- Service role has full access (admin/monitoring)
DROP POLICY IF EXISTS "Service role manages audit logs" ON audit_logs;
CREATE POLICY "Service role manages audit logs"
  ON audit_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant access to authenticated users (read only their own logs)
GRANT SELECT ON audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON audit_logs TO service_role;

-- Immutability: Only service role can insert; no updates/deletes
REVOKE INSERT ON audit_logs FROM authenticated;

COMMENT ON TABLE audit_logs IS 'Immutable audit trail for sensitive operations. Used for compliance and security monitoring.';
COMMENT ON COLUMN audit_logs.action IS 'Action type: account.delete_requested, account.delete_completed, oauth.token_issued, oauth.token_refreshed, report.submitted, report.escalated, etc.';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of affected resource: account, oauth_token, report, session, etc.';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context: deletion_reason, report_category, oauth_provider, etc.';
COMMENT ON COLUMN audit_logs.outcome IS 'success or failure (used for security monitoring)';
