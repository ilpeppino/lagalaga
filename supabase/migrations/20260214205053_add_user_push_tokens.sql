CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  device_id TEXT,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id
  ON public.user_push_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_last_seen
  ON public.user_push_tokens (last_seen_at);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Push tokens service select" ON public.user_push_tokens;
DROP POLICY IF EXISTS "Push tokens service insert" ON public.user_push_tokens;
DROP POLICY IF EXISTS "Push tokens service update" ON public.user_push_tokens;
DROP POLICY IF EXISTS "Push tokens service delete" ON public.user_push_tokens;

CREATE POLICY "Push tokens service select"
  ON public.user_push_tokens FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Push tokens service insert"
  ON public.user_push_tokens FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Push tokens service update"
  ON public.user_push_tokens FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Push tokens service delete"
  ON public.user_push_tokens FOR DELETE
  USING (auth.role() = 'service_role');
