# Play Console & Google Sign-In: Production Setup Guide

**App**: Lagalaga  
**Android package**: `com.ilpeppino.lagalaga`  
**Firebase project**: `lagalaga-19985` (number: `697006480494`)  
**EAS project ID**: `36b14711-e62b-452d-82bf-e8e7f9128fe6`  
**Last verified**: 2026-02-27

---

## Implementation Status

Before following this guide, know the current state of the Google Sign-In feature:

| Layer | Status | Notes |
|---|---|---|
| Backend `GET /api/auth/google/start` | **Implemented** | Returns Google authorization URL |
| Backend `POST /api/auth/google/callback` | **Implemented** | Exchanges code, issues JWT |
| Backend env vars | **Partially configured** | `GOOGLE_AUDIENCE` is set in production; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` are **not yet set** in production |
| Mobile sign-in button | **Not yet implemented** | `app/auth/sign-in.tsx` shows only "Sign in with Roblox"; the Google button is pending |
| Mobile callback handler | **Not yet implemented** | No screen handles `lagalaga://auth?code=...&state=...` yet |

This guide prepares Google Cloud Console and Play Console so that when the mobile frontend work is completed, Google Sign-In works in production **on the first attempt** rather than failing with cryptic OAuth errors.

---

## Section 1 — Architecture Summary

### How Google login works in LagaLaga

LagaLaga uses a **backend-mediated Authorization Code + PKCE flow**. There is no native Android Google Sign-In SDK (no `Credential Manager` or `GoogleSignInClient`). The sequence is:

```
Mobile app
  │
  ├─ 1. GET /api/auth/google/start
  │      Backend generates: state (HMAC-signed), code_verifier, code_challenge, nonce
  │      Returns: Google authorization URL
  │
  ├─ 2. App opens Google URL in in-app browser (Expo WebBrowser / Linking.openURL)
  │      Google authenticates the user
  │      Google redirects to GOOGLE_REDIRECT_URI (HTTPS backend callback) with code + state
  │
  ├─ 3. Backend exchanges code and then redirects (302) to the app deep link (e.g., lagalaga://auth/google?...)
  │
  ├─ 4. Android OS intercepts the lagalaga:// deep link → opens Lagalaga app
  │      (pending: mobile callback screen reads code + state from URL params)
  │
  └─ 5. POST /api/auth/google/callback  { code, state }
         Backend:
           - Validates HMAC state
           - Exchanges code for Google tokens (using GOOGLE_CLIENT_ID + GOOGLE_REDIRECT_URI)
           - Validates ID token (issuer, audience, nonce, JWKS signature)
           - Looks up or creates app_users row
           - Links google platform in user_platforms
           - Returns LagaLaga JWT access + refresh tokens
```

**Source files:**
- Backend auth URL generation: `backend/src/services/googleOAuth.ts`
- Backend callback handler: `backend/src/routes/roblox-connect.routes.ts` → `POST /api/auth/google/callback`
- Backend user resolution: `backend/src/services/google-auth.service.ts`
- Backend env config: `backend/src/config/env.ts`

### Which OAuth client types are required

| Client type | Required? | Why |
|---|---|---|
| **Web Application** | **Yes** | The backend performs the token exchange using `client_id` + `client_secret` + `redirect_uri`. This requires a Web Application client. |
| **Android** | No (for current flow) | Android OAuth clients use SHA-1 fingerprint validation instead of client secrets. LagaLaga's backend-mediated flow does not use the Android client type. |
| **iOS** | No | Not applicable. |

> **Note on SHA-1**: SHA-1 fingerprints are NOT required for the Google Sign-In OAuth flow as implemented. However, SHA-1 IS required for Firebase services (specifically FCM push notifications, which LagaLaga uses). The Firebase steps are covered in Section 3.

### Where the backend validates tokens

`backend/src/services/googleOAuth.ts` → `validateIdToken()`:
- Fetches Google's JWKS from `https://www.googleapis.com/oauth2/v3/certs` (or `GOOGLE_JWKS_URI` override)
- Verifies the ID token signature using `jose` library
- Validates `audience` against `GOOGLE_CLIENT_ID`
- Validates `issuer` against `https://accounts.google.com`
- Validates `nonce` to prevent replay attacks

---

## Section 2 — Values Extracted From This Repository

These values were verified by inspecting the repository. Do not substitute.

| Value | Source | Verified value |
|---|---|---|
| Android package name | `app.config.ts` | `com.ilpeppino.lagalaga` |
| App deep link scheme | `app.config.ts` | `lagalaga` |
| Google OAuth redirect URI (production) | Render backend domain | https://lagalaga-api.onrender.com/api/auth/google/callback |
| App deep link scheme (post-auth redirect) | app.config.ts | lagalaga |
| OAuth scopes requested | `googleOAuth.ts` `generateAuthorizationUrl` | `openid email profile` |
| Token exchange endpoint | `googleOAuth.ts` | `https://oauth2.googleapis.com/token` (auto-discovered via OIDC) |
| Expected issuer | `backend/src/config/env.ts` default | `https://accounts.google.com` |
| Firebase project ID | `google-services.json` | `lagalaga-19985` |
| Firebase project number | `google-services.json` | `697006480494` |
| EAS project ID | `app.config.ts` extra.eas.projectId | `36b14711-e62b-452d-82bf-e8e7f9128fe6` |
| Backend env var: client ID | `backend/src/config/env.ts` | `GOOGLE_CLIENT_ID` |
| Backend env var: client secret | `backend/src/config/env.ts` | `GOOGLE_CLIENT_SECRET` |
| Backend env var: redirect URI | `backend/src/config/env.ts` | GOOGLE_REDIRECT_URI (must be HTTPS backend callback in production; see Section 4.3) |
| Backend env var: issuer | `backend/src/config/env.ts` | `GOOGLE_ISSUER` (default: `https://accounts.google.com`) |
| Backend env var: JWKS override | `backend/src/config/env.ts` | `GOOGLE_JWKS_URI` (leave empty to use OIDC discovery) |

### Values that must be confirmed manually

The following cannot be extracted from the repository and require manual verification in external consoles:

- **Play App Signing status**: Must be confirmed at [Google Play Console → Setup → App signing](https://play.google.com/console). EAS production builds typically opt into Play App Signing automatically, but this must be verified.
- **Play App Signing key SHA-1**: Listed in Play Console under App signing. Required for Firebase, not for the OAuth Web client.
- **Upload key SHA-1**: Listed in Play Console under App signing. Required for Firebase debug/staging configuration, not for production Firebase validation.
- **Current production `GOOGLE_CLIENT_ID`**: The production `.env` has `GOOGLE_AUDIENCE` with three client IDs from project `697006480494` but no `GOOGLE_CLIENT_ID` is set. A Web Application client must be selected or created and its ID set as `GOOGLE_CLIENT_ID`.

---

## Section 3 — Google Play Console: App Signing

### Why this section matters for Firebase (FCM push notifications)

LagaLaga uses Expo push notifications (`expo-notifications`), which on Android rely on Firebase Cloud Messaging (FCM). FCM validates that the APK signature matches the SHA-1 registered in the Firebase project. If the wrong SHA-1 is registered, push notifications silently fail.

When you distribute through Google Play, Play App Signing replaces your upload key with Google's managed signing key. The SHA-1 of this managed key (not your upload key) must be registered in Firebase.

### Step 1: Confirm Play App Signing is enabled

1. Open [Google Play Console](https://play.google.com/console)
2. Select **Lagalaga** (`com.ilpeppino.lagalaga`)
3. Go to **Setup → App integrity** (formerly "App signing")
4. **What to see**: A page showing "App signing key certificate" and "Upload key certificate"
5. **If you see this page**: Play App Signing is active. Proceed.
6. **If you don't see this page**: Play App Signing is not enabled. EAS production builds submitted to Play automatically opt in on first submission. Check your submission history.

> **Official reference**: [Google Play App Signing documentation](https://support.google.com/googleplay/android-developer/answer/9842756)

### Step 2: Copy the App Signing key SHA-1

On the **App integrity** page:

1. Locate the section titled **"App signing key certificate"**
2. Find the **SHA-1 certificate fingerprint** (format: `XX:XX:XX:...`, 59 characters with colons)
3. Copy this value — it is the SHA-1 of the key Google uses to sign APKs installed on user devices
4. **Do NOT copy the "Upload key certificate" SHA-1** — upload key SHA-1 is only valid for debug/dev Firebase configs, not for production

### Why the upload key SHA-1 is NOT enough

When Play App Signing is active, the APK that reaches users is signed with Google's key, not your upload key. Android's package validation checks the signature on the installed APK. Firebase validates against the signature users actually have. If you register the upload key SHA-1 in Firebase instead of the app signing key SHA-1, FCM will reject the authentication and push notifications will fail silently.

### Step 3: Register the Play App Signing SHA-1 in Firebase

1. Open [Firebase Console](https://console.firebase.google.com/project/lagalaga-19985/settings/general)
2. Go to **Project settings → General → Your apps**
3. Select the Android app (`com.ilpeppino.lagalaga`)
4. Under **"SHA certificate fingerprints"**, click **"Add fingerprint"**
5. Paste the App signing key SHA-1 from Play Console
6. Click **"Save"**
7. Download the updated `google-services.json`
8. Replace `./google-services.json` in the repository root
9. Rebuild and submit a new production build

**Screenshot to look for**: Firebase Console → Project settings → Your apps → `com.ilpeppino.lagalaga` → "SHA certificate fingerprints" section with an "Add fingerprint" button.

> **Official reference**: [Add SHA-1 fingerprint to Firebase project](https://developers.google.com/android/guides/client-auth#using_keytool_on_nix)

---

## Section 4 — Google Cloud Console: OAuth Setup

### 4.1 Navigate to the correct project

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. In the project picker (top bar), select **lagalaga-19985** (project number 697006480494)
3. **Why this specific project**: It matches the Firebase project used by the app (`google-services.json` → `project_id: lagalaga-19985`). Using a different GCP project would cause `invalid_audience` errors since the token issuer would not match.

### 4.2 Configure the OAuth Consent Screen

This must be done before creating OAuth clients. The consent screen is what users see when they tap "Sign in with Google".

1. Go to **APIs & Services → OAuth consent screen** ([direct link](https://console.cloud.google.com/apis/credentials/consent?project=lagalaga-19985))
2. Select **"External"** user type (unless all users are in a single Google Workspace domain)
3. Click **"Create"**

Fill in the required fields:

| Field | Value |
|---|---|
| App name | `Lagalaga` |
| User support email | Your support email address |
| Developer contact email | Your developer contact |
| App homepage | `https://ilpeppino.github.io/lagalaga/` |
| App privacy policy | `https://ilpeppino.github.io/lagalaga/privacy-policy.html` |
| App terms of service | `https://ilpeppino.github.io/lagalaga/terms.html` |
| Authorized domains | `ilpeppino.github.io` |

**What breaks if skipped**: Google will not allow your OAuth flow to complete for real users if the consent screen is not configured. Unauthenticated users will see an error screen.

#### Scopes

1. On the consent screen configuration, click **"Add or remove scopes"**
2. Add the following scopes (they match what `googleOAuth.ts` requests):
   - `.../auth/userinfo.email` — required by `email` scope
   - `.../auth/userinfo.profile` — required by `profile` scope
   - `openid` — required by `openid` scope
3. These are non-sensitive scopes and do not require verification by Google

**Screenshot to look for**: The scope selection dialog showing `.../auth/userinfo.email`, `.../auth/userinfo.profile`, and `openid` with checkboxes.

#### Publishing status

- During testing: leave in **"Testing"** status and add individual Google accounts as test users
- Before production launch: click **"Publish App"** to move to **"In production"** status

**What breaks if left in Testing**: Only explicitly added test users can sign in. All other users see "This app hasn't been verified by Google" and cannot proceed. For a public app on Google Play, the consent screen must be in production status.

> **Official reference**: [OAuth consent screen configuration](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)

### 4.3 Create the Web Application OAuth Client

This client is used by the **backend** to exchange the authorization code for tokens.

1. Go to **APIs & Services → Credentials** ([direct link](https://console.cloud.google.com/apis/credentials?project=lagalaga-19985))
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Select **"Web application"** as the application type
4. Name: `Lagalaga Backend (Production)`
5. Under **"Authorized redirect URIs"**, click **"Add URI"** and add:
   ```
   https://lagalaga-api.onrender.com/api/auth/google/callback
   ```
6. Click **"Create"**
7. Copy the **Client ID** and **Client secret** from the dialog

**Why this must be an HTTPS URL**: Google does not allow custom-scheme redirects (like `lagalaga://...`) for **Web application** OAuth clients. Authorized redirect URIs must be publicly reachable web URLs on a valid domain (HTTPS). The backend-mediated flow must therefore use an HTTPS callback on the backend.

**How the deep link still works**: After the backend receives `code` + `state` at `/api/auth/google/callback`, it completes the token exchange and then redirects the browser to the app deep link (e.g. `lagalaga://auth/google?...`). Android intercepts that final deep link and opens the app.

**What breaks if the HTTPS URI is missing or mismatched**: Google returns `redirect_uri_mismatch` and the sign-in cannot complete. The `redirect_uri` used in the authorization request and in the token exchange must match the registered URI **exactly** (character-for-character).

### Common console error

When trying to register a custom scheme like `lagalaga://auth` as a Web Application redirect URI in Google Cloud Console, you may see errors such as:
- "Invalid Redirect: must end with a public top-level domain"
- "Invalid Redirect: must use a domain that is a valid top private domain"

These errors occur because Google requires Web client redirect URIs to be HTTPS URLs on a public domain. The fix is to use the backend HTTPS callback URI as shown above.

### 4.4 Set the Backend Environment Variables

Once the Web Application client is created, set these variables in the production backend environment (Render or your deployment platform):

```bash
GOOGLE_CLIENT_ID=<Client ID from step 4.3>
GOOGLE_CLIENT_SECRET=<Client secret from step 4.3>
GOOGLE_REDIRECT_URI=https://lagalaga-api.onrender.com/api/auth/google/callback
GOOGLE_ISSUER=https://accounts.google.com
# Leave GOOGLE_JWKS_URI empty — backend auto-discovers via OIDC
GOOGLE_JWKS_URI=
```

> **Important**: The production backend `.env` currently has `GOOGLE_AUDIENCE` set with three client IDs but `GOOGLE_CLIENT_ID` is not set. `GOOGLE_AUDIENCE` is not a recognized env var in `backend/src/config/env.ts` and has no effect. It must be replaced with `GOOGLE_CLIENT_ID`.

**What breaks if `GOOGLE_CLIENT_ID` is wrong**: The backend's `validateIdToken()` checks `audience` against `GOOGLE_CLIENT_ID`. If they do not match, every Google sign-in attempt returns `AUTH_OAUTH_FAILED` with "Invalid audience".

### 4.5 No Android OAuth Client is required for this flow

Do not create an Android-type OAuth client unless adding native Android Google Sign-In SDK in future. The current flow:
- Does not use `GoogleSignInClient` or `CredentialManager`
- Does not require an Android client ID in `google-services.json`
- Does not require SHA-1 registration in Google Cloud Console (only in Firebase for FCM)

> **Official reference on PKCE for web server apps**: [OAuth 2.0 for Web Server Applications — PKCE](https://developers.google.com/identity/protocols/oauth2/web-server)

---

## Section 5 — Production Validation Checklist

Perform these steps after completing Sections 3 and 4 and after the mobile frontend Google callback handler is implemented.

### Step 1: Internal test track validation

You can validate using either EAS or a local Android build pipeline. If you prefer not to use EAS, follow Option B or Option C below.

**Option A — EAS (existing)**

Submit a new production build via EAS:
```bash
eas build --platform android --profile production
eas submit --platform android --profile production
```

**Option B — Local Gradle (recommended if you avoid EAS)**

1. Ensure the `android/` directory exists (Expo prebuild must have been run at least once). If missing, run:
   ```bash
   npx expo prebuild --platform android
   ```
2. Build a release AAB locally:
   ```bash
   cd android
   ./gradlew clean
   ./gradlew bundleRelease
   ```
3. Locate the AAB output (typical path):
   `android/app/build/outputs/bundle/release/app-release.aab`
4. Upload that AAB to Play Console Internal testing release.

**Option C — Expo local run + Gradle output (useful for quick validation)**

1. Build/install a local release APK for device testing (not Play track) using:
   ```bash
   APP_VARIANT=prod npx expo run:android --variant release
   ```
   If the project does not support `--variant release`, use Gradle assembleRelease instead:
   ```bash
   cd android
   ./gradlew assembleRelease
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```
2. **Note:** This option is for device functional testing only and does **not** validate Play App Signing behavior. For uploading the .aab use the following procedure:
   ```bash
   cd android
   ./gradlew clean bundleRelease
   ./gradlew :app:signingReport
   keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab | rg "SHA1:"
   ```

**Important:**  
- Play Store Internal track installs are signed with **Play App Signing**.  
- Sideloaded local builds are signed with your local keystore.  
- Therefore, for final production validation you must install from Play Internal track.

5. Install via the Play Store internal track link (not sideload — sideload uses a different signature). Even if you test locally via Option C, you **still need** to do the Play Internal track test to validate Play App Signing and push notification compatibility.

### Step 2: Test the Google Sign-In flow

On the test device with the Play-track build installed:

1. Open the app → reach the sign-in screen
2. Tap **"Sign in with Google"** (requires frontend implementation to be complete)
3. **Expected**: An in-app browser opens showing a Google sign-in or account-picker page
4. Sign in with a Google account
5. **Expected**: Google redirects to `https://lagalaga-api.onrender.com/api/auth/google/callback?code=...&state=...`
6. **Expected**: Backend completes auth and redirects to an app deep link like `lagalaga://auth/google?...`
7. **Expected**: The Lagalaga app opens automatically (Android intercepts the deep link)
8. **Expected**: The app navigates the user to the Roblox connection gate (since no Roblox is linked yet)
9. **Expected**: No crash, no stuck loading state

### Step 3: Multi-device and multi-account testing

- Test with at least two different Google accounts
- Test on both physical device and emulator
- Test sign-out → sign back in with same account → verify same LagaLaga identity is restored

### Expected successful behavior

| Action | Expected result |
|---|---|
| Tap "Sign in with Google" | Browser opens Google account picker |
| Complete Google sign-in | App resumes, user is authenticated |
| New Google user | Roblox connect gate is shown |
| Returning Google user | User goes directly to sessions |
| Same Google + connected Roblox | All Roblox features accessible |

### Common error codes and their causes

| Error | Cause |
|---|---|
| `redirect_uri_mismatch` | `lagalaga://auth` not listed in the Web Application OAuth client's authorized redirect URIs |
| `invalid_audience` | `GOOGLE_CLIENT_ID` env var does not match the client ID used to issue the ID token |
| `AUTH_INVALID_STATE` | State parameter expired (10-minute TTL) or was tampered with; user took too long in browser |
| `ACCOUNT_LINK_CONFLICT` (409) | The Google account is already linked to a different LagaLaga user |
| App does not open after Google auth | `lagalaga://auth` deep link not configured in Android intent filter; or Play App Signing SHA-1 mismatch causes install to fail |
| Push notifications not delivered | Firebase SHA-1 not updated with Play App Signing key (Section 3) |

---

## Section 6 — Troubleshooting Matrix

| Symptom | Likely Cause | Where to Fix | How to Verify |
|---|---|---|---|
| Browser opens but returns `redirect_uri_mismatch` | `https://lagalaga-api.onrender.com/api/auth/google/callback` missing from authorized redirect URIs | GCP Console → Credentials → Web client → Authorized redirect URIs | The error message in the browser explicitly states the URI mismatch |
| App does not open after Google redirects | Android intent filter for `lagalaga://auth` not registered, OR build not from Play track | `app.config.ts` intent filters; rebuild via EAS | Run `adb logcat | grep ActivityManager` and look for unhandled scheme |
| "This app hasn't been verified" error in browser | OAuth consent screen is in Testing status and the user is not on the test user list | GCP Console → OAuth consent screen → Publish App or add test user | Check consent screen publishing status |
| `invalid_audience` error in backend logs | `GOOGLE_CLIENT_ID` does not match the client ID in the issued ID token | Render/backend env: set `GOOGLE_CLIENT_ID` to match the Web Application client | Check backend logs for `AUTH_OAUTH_FAILED` with audience message |
| `invalid_grant` during token exchange | `GOOGLE_REDIRECT_URI` in backend env does not match authorized redirect URI | Set `GOOGLE_REDIRECT_URI=https://lagalaga-api.onrender.com/api/auth/google/callback` in backend env, and verify it matches GCP Console | Google token endpoint returns `{"error":"invalid_grant","error_description":"Bad Request"}` |
| Push notifications not working on Play-distributed builds | Firebase SHA-1 not updated with Play App Signing key | Firebase Console → Project settings → SHA-1 fingerprints | Run `adb logcat | grep FCM` and check for registration errors |
| Same Google account creates two LagaLaga users | Backend resolved user by Roblox ID instead of Google sub on a returning login | Verify `user_platforms` table has `platform_id='google'` row; check `PlatformIdentityService.findUserIdByPlatform()` | Query `SELECT * FROM user_platforms WHERE platform_id='google' AND platform_user_id='<google-sub>'` |
| Google sign-in succeeds but Roblox features show errors | User is Google-first with no Roblox linked; `ROBLOX_NOT_CONNECTED` errors not routed to gate | Check `robloxGateController.ts` is wired in `app/_layout.tsx`; verify `requireRobloxConnected` middleware is on Roblox-specific routes | Should redirect to `/me` screen with Connect Roblox UI |
| OAuth state expired error | User took more than 10 minutes to complete Google sign-in | Expected behavior; user must restart the sign-in flow | Check `GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000` in `roblox-connect.routes.ts` |

---

## Section 7 — Security Notes

### Tokens must never be logged

`googleOAuth.ts` performs the token exchange and ID token validation. Never add logging to these paths that includes:
- `access_token` values
- `id_token` values
- `refresh_token` values
- `code` parameter from the authorization callback
- `code_verifier` (PKCE secret)

These values grant access to user accounts. If they appear in logs, rotate `JWT_SECRET` and `REFRESH_TOKEN_SECRET` immediately and audit which accounts may have been affected.

The backend currently logs only safe metadata (provider name, userId, success/failure status). Do not alter these log statements to add token content.

### Minimal scopes are required

LagaLaga requests `openid email profile`. This is the minimum required to:
- Identify the user uniquely (`sub` from `openid`)
- Store identity metadata in `user_platforms` (`email`, `name`, `picture` from `email` and `profile`)

Do not add scopes such as `https://www.googleapis.com/auth/gmail.readonly` or any Drive, Calendar, or Contacts scopes. Adding unnecessary scopes:
- Triggers Google's manual app review process (can take weeks)
- Erodes user trust
- Increases regulatory exposure under GDPR and COPPA

### Automatic account merging is dangerous

`GoogleAuthService.resolveUserForGoogleLogin()` looks up an existing user by Google `sub` (the unique Google user ID). If no match is found, a new `app_users` row is created with null Roblox fields. It does NOT automatically merge with an existing Roblox-first account that happens to have the same email.

This is intentional. Automatic merging by email would allow one person to hijack another's account by:
1. Creating a Google account with the same email as a victim's Roblox display name (or any email that matches)
2. Signing in with Google
3. The system merges and grants access to the victim's session history, friends, and profile

If a user wants their Google login and Roblox login to be the same account, they must explicitly link Roblox from the Me screen after signing in with Google. This is enforced by `PlatformIdentityService.assertPlatformNotLinkedToDifferentUser()` which returns `ACCOUNT_LINK_CONFLICT` (409) if a cross-user link is attempted.

### The `GOOGLE_CLIENT_SECRET` is a backend-only secret

`GOOGLE_CLIENT_SECRET` is used only in `googleOAuth.ts` on the backend server (Render). It must never appear in:
- The Expo app bundle (any `EXPO_PUBLIC_*` variable)
- `google-services.json`
- Git history
- Build logs

The frontend only calls `GET /api/auth/google/start` (which returns the authorization URL) and `POST /api/auth/google/callback` (which sends code + state). The frontend never handles the client secret directly.

---

## Section 8 — Final Go-Live Checklist

Complete all items before marking Google Sign-In as ready for production.

**Google Cloud Console**
- [ ] GCP project `lagalaga-19985` is selected (not a personal or wrong project)
- [ ] OAuth consent screen is configured with correct app name, privacy policy URL (`https://ilpeppino.github.io/lagalaga/privacy-policy.html`), and terms URL (`https://ilpeppino.github.io/lagalaga/terms.html`)
- [ ] OAuth consent screen publishing status is **"In production"** (not Testing)
- [ ] Scopes `openid`, `email`, `profile` are added to the consent screen
- [ ] A **Web Application** OAuth client named `Lagalaga Backend (Production)` exists in project `lagalaga-19985`
- [ ] `https://lagalaga-api.onrender.com/api/auth/google/callback` is listed in the Web client's **Authorized redirect URIs** (exact match, no trailing slash)
- [ ] The Web client ID is set as `GOOGLE_CLIENT_ID` in the production backend environment
- [ ] The Web client secret is set as `GOOGLE_CLIENT_SECRET` in the production backend environment

**Backend environment (Render)**
- [ ] `GOOGLE_CLIENT_ID` is set to the Web Application client ID
- [ ] `GOOGLE_CLIENT_SECRET` is set to the Web Application client secret
- [ ] `GOOGLE_REDIRECT_URI` is set to `https://lagalaga-api.onrender.com/api/auth/google/callback`
- [ ] `GOOGLE_ISSUER` is set to `https://accounts.google.com` (or left to default)
- [ ] `GOOGLE_JWKS_URI` is empty (to use OIDC discovery)
- [ ] The old `GOOGLE_AUDIENCE` variable is removed from production env (it has no effect and causes confusion)
- [ ] Backend is redeployed after env var changes

**Firebase (for FCM push notifications)**
- [ ] Play App Signing is confirmed active in Play Console → App integrity
- [ ] Play App Signing key SHA-1 (NOT upload key) is copied from Play Console
- [ ] SHA-1 is added to Firebase project `lagalaga-19985` under the `com.ilpeppino.lagalaga` Android app
- [ ] Updated `google-services.json` is downloaded from Firebase and committed to the repo root
- [ ] A new EAS production build is submitted after `google-services.json` update

**Mobile frontend (pending implementation)**
- [ ] "Sign in with Google" button is added to `app/auth/sign-in.tsx`
- [ ] A callback handler screen or hook is implemented to intercept `lagalaga://auth?code=...&state=...` deep links
- [ ] The handler reads `code` and `state` from URL params and POSTs to `POST /api/auth/google/callback`
- [ ] Account link conflict (`ACCOUNT_LINK_CONFLICT`) is handled by `resolveAccountLinkConflict()` in `src/features/auth/accountLinkConflict.ts`
- [ ] Roblox not connected gate (`ROBLOX_NOT_CONNECTED`) redirects Google-first users to `/me` for Roblox linking

**Testing**
- [ ] App tested from Play internal track (not sideload) on a physical Android device
- [ ] At least two different Google accounts tested
- [ ] New user flow tested: Google sign-in → Roblox gate → Roblox connect → Roblox features accessible
- [ ] Returning user flow tested: sign out → sign back in with same Google → same LagaLaga identity
- [ ] Account link conflict tested: Google user attempts to link Roblox account already linked to another LagaLaga user → conflict error shown
- [ ] Existing Roblox-first login tested and confirmed unaffected
- [ ] Push notifications tested from Play track build and confirmed delivered

---

## Official Google Documentation References

- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server) — authoritative guide for the Web Application client flow
- [OAuth 2.0 PKCE Extension](https://developers.google.com/identity/protocols/oauth2/native-app) — explains PKCE (used in LagaLaga's flow)
- [OAuth Consent Screen configuration](https://support.google.com/cloud/answer/10311615) — publishing, scopes, and verification
- [Google Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756) — how Play App Signing works and where to find the signing key SHA-1
- [Add SHA-1 to Firebase](https://developers.google.com/android/guides/client-auth) — registering fingerprints for Firebase services
- [Google Identity JWKS endpoint](https://www.googleapis.com/oauth2/v3/certs) — public key set used for ID token verification
- [OpenID Connect Discovery](https://accounts.google.com/.well-known/openid-configuration) — the discovery document LagaLaga's backend fetches at startup
