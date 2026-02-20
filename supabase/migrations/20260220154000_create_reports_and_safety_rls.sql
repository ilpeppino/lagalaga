/*
 * In-app safety reporting for Google Play Child Safety compliance.
 */

DO $$
BEGIN
  CREATE TYPE report_category AS ENUM (
    'CSAM',
    'GROOMING_OR_SEXUAL_EXPLOITATION',
    'HARASSMENT_OR_ABUSIVE_BEHAVIOR',
    'IMPERSONATION',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE report_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED', 'ESCALATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  target_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  category report_category NOT NULL,
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  status report_status NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_user_id IS NULL OR reporter_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_created_at ON reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status_created_at ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target_user ON reports (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_target_session ON reports (target_session_id) WHERE target_session_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reports own insert" ON reports;
CREATE POLICY "Reports own insert"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reports own select" ON reports;
CREATE POLICY "Reports own select"
  ON reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reports service update" ON reports;
CREATE POLICY "Reports service update"
  ON reports FOR UPDATE
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Reports service select" ON reports;
CREATE POLICY "Reports service select"
  ON reports FOR SELECT
  TO service_role
  USING (auth.role() = 'service_role');

GRANT SELECT, INSERT ON reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON reports TO service_role;
