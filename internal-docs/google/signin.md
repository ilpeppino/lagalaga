# LagaLaga Google + Roblox Auth: Acceptance Criteria & On-Device Test Plan (Steps 1–5)

> Scope: Validate the end-to-end behavior for:
> 1) DB migration (Google-first users allowed)
> 2) Backend Google OAuth + JWT issuance
> 3) Mobile Google sign-in UI + flow
> 4) Post-login gating (“Roblox must be connected”)
> 5) Account linking rules + conflict handling

---

## Step 1 — DB Migration (Google-first users enabled)

### Acceptance criteria
1. `app_users.roblox_user_id` is **nullable** (NOT NULL removed).
2. `app_users.roblox_username` is **nullable** (NOT NULL removed).
3. The **UNIQUE** constraint on `app_users.roblox_user_id` remains in place.
4. `platforms` contains a row with `id='google'`.
5. Existing rows in `app_users` are unchanged after the migration.
6. RLS policies remain unchanged and still work as before.

### Validation (non-device / DB-level)
- Run:
  - `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='app_users' AND column_name IN ('roblox_user_id','roblox_username');`
  - `SELECT * FROM platforms WHERE id='google';`
  - `SELECT COUNT(*) FROM app_users WHERE roblox_user_id IS NULL;` (should be allowed now)
- Ensure migration applies cleanly on a production-like dataset (staging).

---

## Step 2 — Backend Google OAuth + JWT Issuance

### Acceptance criteria
1. Backend exposes `GET /api/auth/google/start` and returns `{ url }` with a valid Google OAuth authorization URL.
2. Backend exposes `POST /api/auth/google/callback` and:
   - exchanges `code` successfully (valid path),
   - validates the ID token (issuer, audience, signature),
   - issues the **same app JWT session tokens** format used elsewhere (access + refresh + expiry).
3. First-time Google login creates:
   - a new `app_users` row with Roblox fields NULL,
   - a `user_platforms` row linking `platform_id='google'` and `platform_user_id=<google-sub>`.
4. Returning Google login logs the user into the same `app_users.id` (no duplicate user created).
5. No regressions to existing Roblox endpoints:
   - `/api/auth/roblox/start`
   - `/api/auth/roblox/callback`
6. No sensitive info is logged (no auth codes, tokens, full emails).

### On-device tests (requires a build pointing to staging/prod backend)
1. **Google OAuth start reachable**
   - From device, initiate Google login (Step 3 UI).
   - Expect the in-app browser opens a Google consent / login page.
2. **Google OAuth callback success**
   - Complete Google sign-in.
   - App returns to LagaLaga logged in (session created, no crash).
3. **Repeat login**
   - Log out (or reinstall if needed).
   - Sign in again with the same Google account.
   - Expect: same user identity (no “fresh account” behavior like empty profile if your app indicates identity).

### Backend-side verification (recommended during on-device tests)
- Confirm `user_platforms` row exists for google-sub and maps to expected `user_id`.
- Confirm app JWT tokens are issued and accepted by authenticated API endpoints.

---

## Step 3 — Mobile: Google Sign-in UI + Flow

### Acceptance criteria
1. Login/onboarding shows **two options**:
   - “Continue with Roblox” (existing)
   - “Continue with Google” (new)
2. Tapping “Continue with Google”:
   - opens the auth browser,
   - returns to the app after completing sign-in,
   - stores session tokens using the same storage logic as existing login.
3. If user is Google-logged-in but Roblox not connected:
   - app routes to a **Connect Roblox to continue** gate screen.
4. User cancellation (closing auth browser) returns user to login screen without broken state.
5. UI shows loading states during auth and surfaces errors (toast/banner) without crashing.
6. Existing Roblox login flow still works unchanged.

### On-device tests
1. **UI presence**
   - Fresh install -> verify both buttons are present.
2. **Cancel flow**
   - Tap Google login -> cancel/close browser -> expect back on login screen, no spinner stuck.
3. **Success flow**
   - Tap Google login -> complete -> expect logged in state and then (if no Roblox) Connect Roblox gate.
4. **Roblox unchanged**
   - Log out / reinstall -> login with Roblox -> ensure works exactly as before.

---

## Step 4 — Post-login gating (“Roblox required”)

### Acceptance criteria
Backend:
1. Authenticated “current user/profile” endpoint includes `robloxConnected: boolean`.
2. `robloxConnected` is computed from `user_platforms` (`platform_id='roblox'`), not just `app_users` columns.
3. Roblox-dependent endpoints reject requests if Roblox is not connected:
   - HTTP status is consistent (e.g., 403)
   - Error code: `ROBLOX_NOT_CONNECTED`
4. Roblox-dependent endpoints succeed for:
   - Roblox-first users
   - Google users who have linked Roblox

Mobile:
5. App detects `ROBLOX_NOT_CONNECTED` globally and routes to Connect Roblox gate screen.
6. No redirect loops (if already on gate screen, do not bounce repeatedly).
7. Roblox-dependent screens do not remain in broken loading loops; they should render a gate or redirect.

### On-device tests
1. **Google-first user hits a Roblox feature**
   - Fresh install -> login with Google (do NOT connect Roblox).
   - Navigate to any Roblox-dependent area (friends, presence, create/join session if it requires Roblox).
   - Expect: app routes to Connect Roblox gate (or displays gate UI) without crashing.
2. **After connecting Roblox, features unlock**
   - From gate screen, connect Roblox using existing flow.
   - Return to the app.
   - Expect: Roblox-dependent screens now work and show data.
3. **Returning session still gated properly**
   - Force close app, reopen.
   - If Roblox is not connected -> still gated.
   - If Roblox is connected -> not gated.

---

## Step 5 — Safe Linking Rules + Conflict Handling

### Acceptance criteria
Linking rules:
1. Google login:
   - If google identity already linked -> logs into same user
   - Else -> creates new user (no Roblox required)
2. Roblox login:
   - If roblox identity already linked -> logs into same user
   - Else -> creates new user and links Roblox
3. Connect Roblox after Google login:
   - If the Roblox account is NOT linked elsewhere -> link succeeds
   - If the Roblox account IS already linked to another user -> link fails with:
     - HTTP 409
     - error code: `ACCOUNT_LINK_CONFLICT`
4. (Optional if implemented) Connect Google after Roblox login behaves similarly with conflict detection.
5. No “silent merges”:
   - System never automatically merges two existing users.
6. Race-safe behavior:
   - concurrent linking attempts do not create inconsistent state
   - uniqueness is enforced and conflicts are handled deterministically
7. Mobile shows a user-friendly error on conflict and provides next action:
   - “Use original login method”
   - “Contact support” (if available)

### On-device tests (requires 2 distinct LagaLaga accounts + 1 shared Roblox account OR 2 devices)
> To validate conflicts you need a situation where the SAME Roblox account is already linked to a different LagaLaga user.

#### Setup (recommended)
- Device A:
  - Login with Roblox account R (Roblox-first) -> this creates/uses LagaLaga user A linked to R.
- Device B:
  - Login with Google account G (Google-first) -> LagaLaga user B exists, not linked to Roblox.

#### Conflict test
1. On Device B, attempt “Connect Roblox” using Roblox account R (already linked to user A).
2. Expect:
   - App shows conflict message:
     “This Roblox account is already linked to another LagaLaga account.”
   - App does NOT link and does NOT unlock Roblox features.
   - App offers a safe next step (back to login choice; optionally support).

#### Success linking test
1. On Device B, connect Roblox using a DIFFERENT Roblox account R2 not linked elsewhere.
2. Expect:
   - link succeeds,
   - `robloxConnected` becomes true,
   - Roblox-dependent screens unlock.

#### Returning login equivalence test
1. After successful linking (Google G + Roblox R2 linked to same user):
   - Logout.
   - Login with Google -> should land in same account (with Roblox connected).
   - Logout.
   - Login with Roblox R2 -> should land in the same account (same profile/data).
2. Expect: both providers lead to the same LagaLaga identity and data.

#### Cancellation / error resilience
1. Start connect flow and cancel.
2. Expect: user remains logged in (Google) but still not connected; gate still applies.

---

## End-to-end “Done” Checklist (All steps)
1. New users can start with Google without Roblox.
2. App clearly requires Roblox connection to use Roblox features.
3. Linking Roblox after Google is smooth and safe.
4. Users can login with either Google or Roblox and reach the same account once linked.
5. Conflicts are handled safely (no account takeover, no silent merges).
6. No regressions: Roblox-first login still works and existing users remain intact.
