/*
 * Account deletion support
 * - app_users.status lifecycle
 * - app_users.token_version for stateless JWT revocation
 * - account_deletion_requests queue/state table
 */

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_status_check'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_status_check
      CHECK (status IN ('ACTIVE', 'PENDING_DELETION', 'DELETED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_status
  ON public.app_users(status);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_purge_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  initiator TEXT NOT NULL DEFAULT 'IN_APP',
  reason TEXT,
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_deletion_requests_status_check
    CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELED', 'FAILED')),
  CONSTRAINT account_deletion_requests_initiator_check
    CHECK (initiator IN ('IN_APP', 'WEB'))
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_id
  ON public.account_deletion_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status_scheduled
  ON public.account_deletion_requests(status, scheduled_purge_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_requests_user_pending
  ON public.account_deletion_requests(user_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_requested_at
  ON public.account_deletion_requests(user_id, requested_at DESC);

CREATE OR REPLACE FUNCTION public.update_account_deletion_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_deletion_requests_updated_at
  ON public.account_deletion_requests;

CREATE TRIGGER trg_account_deletion_requests_updated_at
  BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_deletion_requests_updated_at();
