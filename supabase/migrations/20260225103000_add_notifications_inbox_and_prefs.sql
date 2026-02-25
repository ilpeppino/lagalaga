CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created_at
  ON public.in_app_notifications (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_in_app_notifications_user_idempotency
  ON public.in_app_notifications (user_id, idempotency_key);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notifications user read own" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Notifications user update own" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Notifications service insert" ON public.in_app_notifications;

CREATE POLICY "Notifications user read own"
  ON public.in_app_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Notifications user update own"
  ON public.in_app_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notifications service insert"
  ON public.in_app_notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id UUID PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  sessions_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  friend_requests_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user_id
  ON public.user_notification_prefs (user_id);

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notification prefs user read own" ON public.user_notification_prefs;
DROP POLICY IF EXISTS "Notification prefs user update own" ON public.user_notification_prefs;
DROP POLICY IF EXISTS "Notification prefs user insert own" ON public.user_notification_prefs;
DROP POLICY IF EXISTS "Notification prefs service select" ON public.user_notification_prefs;
DROP POLICY IF EXISTS "Notification prefs service insert" ON public.user_notification_prefs;
DROP POLICY IF EXISTS "Notification prefs service update" ON public.user_notification_prefs;

CREATE POLICY "Notification prefs user read own"
  ON public.user_notification_prefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Notification prefs user insert own"
  ON public.user_notification_prefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notification prefs user update own"
  ON public.user_notification_prefs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notification prefs service select"
  ON public.user_notification_prefs FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Notification prefs service insert"
  ON public.user_notification_prefs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Notification prefs service update"
  ON public.user_notification_prefs FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
