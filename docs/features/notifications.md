You are an agentic coding assistant working on the Expo Router React Native app “lagalaga” with a backend-mediation architecture (app talks to backend; backend talks to Supabase with service role). Implement a complete vertical slice for “session invite via push notification”:

Feature goal
User A (host) creates a session and invites User B (guest).
User B receives a push notification: “You are invited to a session”.
When B taps the notification, the app opens an Invite screen showing session details and two buttons: Accept and Decline.
Edit/Delete sessions are out of scope.

Hard constraints
- No new UI libraries. React Native core components only.
- Use Expo Router for navigation.
- Use expo-notifications for push notifications.
- Use Expo Push service (ExpoPushToken) for sending pushes.
- Do not expose Supabase service role to the app.
- Backend must authenticate requests with the existing app JWT.
- Provide full file contents for every changed/new file.
- Provide terminal commands.
- Commit after each major step with clear messages.

Assumptions
- Backend already issues and validates an app JWT and attaches req.user = { userId, robloxUserId }.
- Supabase tables for sessions exist (sessions, session_participants, games) and backend can insert/select.
- There is an API client in the app (or create one) that attaches Authorization: Bearer <jwt>.
- You will add new DB tables for push tokens and invites.

Part A: Database (Supabase) schema changes
1) Create table public.user_push_tokens
- id uuid PK default gen_random_uuid()
- user_id uuid not null (internal app user id)
- expo_push_token text not null unique
- device_id text null (optional)
- platform text null (ios/android/web)
- created_at timestamptz not null default now()
- last_seen_at timestamptz not null default now()
- unique (user_id, expo_push_token)
2) Create table public.session_invites
- id uuid PK default gen_random_uuid()
- session_id uuid not null references public.sessions(id) on delete cascade
- host_user_id uuid not null
- guest_user_id uuid not null
- status text not null check status in ('pending','accepted','declined','cancelled') default 'pending'
- created_at timestamptz not null default now()
- responded_at timestamptz null
- unique (session_id, guest_user_id) where status in ('pending','accepted') (if partial unique index is too complex, enforce in backend for now)
3) Provide a single SQL migration file under docs/supabase-invites.sql containing all SQL and comments. Do not enable RLS for these tables because backend uses service role, but keep comments explaining that they are server-managed.

Part B: Backend changes
Create or update backend module(s) to support:
1) POST /me/push-tokens
- Auth required
- Body: { expoPushToken: string, deviceId?: string, platform?: string }
- Upsert into public.user_push_tokens:
  - if token exists, set last_seen_at=now(), user_id=req.user.userId, platform/device_id updated if provided
- Response: 204
2) GET /invites/:inviteId
- Auth required
- Only guest_user_id == req.user.userId can fetch
- Return:
  - invite: { id, status, sessionId }
  - session: { id, title, start_time_utc, max_players, session_type, visibility, status, game info }
  - host: { userId, robloxUserId (if known), avatarHeadshotUrl (optional, if your /me logic supports it) }
3) POST /sessions/:sessionId/invite
- Auth required
- Body: { guestUserId: string }
- Validate:
  - requester is host of the session (session.host_user_id == req.user.userId)
  - session.status == scheduled
- Create invite row status=pending
- Lookup guest’s expo push tokens from public.user_push_tokens
- Send push notification to all guest tokens via Expo push API:
  - title: "Session invite"
  - body: "You have been invited to a session"
  - data: { type: "session_invite", inviteId: "<uuid>", sessionId: "<uuid>" }
4) POST /invites/:inviteId/accept
- Auth required
- Validate invite exists, guest_user_id == req.user.userId, status == pending
- Capacity-safe join:
  - Use a transaction, lock the session row
  - Count joined participants, ensure < max_players
  - Insert into session_participants (session_id, user_id, role='participant', state='joined') with upsert
- Update invite status to accepted, responded_at=now()
- Return: { ok: true, sessionId }
5) POST /invites/:inviteId/decline
- Auth required
- Validate invite exists, guest_user_id == req.user.userId, status == pending
- Update invite status to declined, responded_at=now()
- Return: { ok: true }

Backend implementation requirements
- Add an Expo push sending helper using fetch to https://exp.host/--/api/v2/push/send
- Validate ExpoPushToken format minimally (must start with "ExponentPushToken[" or "ExpoPushToken["), but do not over-restrict
- If push sending fails, still keep invite created; return success
- Add server-side logging for push send failures
- Include a short timeout for push send (5s)

Part C: App changes (Expo Router)
1) Install notifications library
- npx expo install expo-notifications expo-device expo-constants
2) Add a notifications registration module
Create src/features/notifications/registerPushToken.ts
- Request permissions
- Get Expo push token via Notifications.getExpoPushTokenAsync
- Post to backend POST /me/push-tokens
- Should be safe to call multiple times; backend upserts
- On web: do nothing (or return early) because Expo push tokens are not the same; keep behavior no-crash
3) Handle notification taps
Create src/features/notifications/notificationRouting.ts
- On app startup, set:
  - Notifications.addNotificationResponseReceivedListener
  - Notifications.getLastNotificationResponseAsync (for cold start)
- If notification data.type == "session_invite" and inviteId exists:
  - Navigate to route /invites/[inviteId]
4) Create Invite screen route
Create app/invites/[inviteId].tsx
- On mount:
  - Call GET /invites/:inviteId
  - Show loading
  - Render session title/game name, start time, host info (optional), max players
- Show two buttons:
  - Accept: POST /invites/:inviteId/accept then navigate to /sessions/[sessionId]
  - Decline: POST /invites/:inviteId/decline then navigate back to /sessions
- Handle failures with inline error text; never crash
5) Add token registration call
- Call registerPushToken() after user is authenticated (where you know you have backend JWT). Do not call it before login.
- If you have an auth gate/hook, place it in the post-login landing path or in the root layout when session token exists.
6) Add host invite action UI (minimal)
- On session detail screen app/sessions/[id].tsx:
  - Add an “Invite user” section with one text input (guestUserId) and a button “Send invite”
  - On press call POST /sessions/:id/invite { guestUserId }
  - Show success/failure message
- No user search UI is needed yet.

Navigation / header requirements
- Ensure the Invite screen shows as a normal screen (not a nested modal unless your app already uses modals)
- Ensure notification tap opens Invite screen reliably even from cold start

Operational setup instructions (must be included in your output)
- Explain that push notifications require a development build or proper setup for standalone, and provide the Expo docs note:
  - For production you must configure FCM (Android) and APNs (iOS) credentials in Expo/EAS
- But implement code so it still runs in dev without crashing even if push token cannot be obtained.

Deliverables
1) Terminal commands
2) List of files created/modified
3) Full contents of each created/modified file
4) SQL migration file content (docs/supabase-invites.sql)
5) Commit messages and the git commands used
6) Brief manual test plan:
- Login as B, ensure token registration endpoint hit
- Login as A, create session, invite B, verify B receives push
- Tap push, ensure Invite screen opens
- Accept, ensure join happens and session detail opens
- Decline, ensure status updates and returns to sessions

Commits (minimum)
1) docs: add invites and push tokens schema
2) feat(backend): add push token registration and invite endpoints
3) feat(app): register push token and handle notification navigation
4) feat(app): invite screen accept/decline flow
5) feat(app): host send invite UI on session detail

Begin implementation now.
