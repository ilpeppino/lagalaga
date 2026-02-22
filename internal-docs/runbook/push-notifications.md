# Push Notifications Operations Guide

> **Status:** Active
> **Last Updated:** 2026-02-17
> **Audience:** DevOps, Platform Engineers

## Overview

This guide covers the operational aspects of push notifications in LagaLaga, including setup, configuration, deployment, testing, and troubleshooting.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Development Setup](#development-setup)
4. [Production Configuration](#production-configuration)
5. [Testing Procedures](#testing-procedures)
6. [Monitoring & Debugging](#monitoring--debugging)
7. [Troubleshooting](#troubleshooting)
8. [Security Considerations](#security-considerations)

---

## Architecture Overview

### Components

```
┌─────────────┐
│   Mobile    │  1. Registers push token via expo-notifications
│     App     │  2. Sends token to backend API
└──────┬──────┘
       │
       │ POST /api/me/push-tokens
       ▼
┌─────────────┐
│   Backend   │  3. Stores token in Supabase
│   (Fastify) │  4. Sends pushes via Expo Push API
└──────┬──────┘
       │
       │ HTTPS
       ▼
┌─────────────┐
│ Expo Push   │  5. Routes to APNs (iOS) or FCM (Android)
│   Service   │
└──────┬──────┘
       │
       ├─────────────┬─────────────┐
       ▼             ▼             ▼
    APNs          FCM          Device
```

### Database

**Table:** `user_push_tokens`
- Stores Expo push tokens per user/device
- Managed by backend with service role
- Indexed on `user_id` for fast lookups
- Tracks `last_seen_at` for cleanup

### Notification Flow

1. User logs in → Frontend registers push token
2. Backend stores token in `user_push_tokens` table
3. Session created with invites → Backend resolves invitees
4. Backend sends push notification via Expo Push API
5. Expo routes to APNs (iOS) or FCM (Android)
6. User taps notification → App opens invite screen

---

## Prerequisites

### Required Accounts & Credentials

| Service | Purpose | Required For |
|---------|---------|--------------|
| Apple Developer | APNs certificates/keys | iOS push notifications |
| Firebase Console | FCM configuration | Android push notifications |
| Expo/EAS Account | Push token management | Both platforms |

### Required Software

```bash
# EAS CLI (for credential management)
npm install -g eas-cli

# Expo CLI (for local development)
npm install -g expo-cli

# Verify installations
eas --version
expo --version
```

### Project Configuration

The following is already configured in the project:

```json
// app.json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/generated/icon.png",
          "color": "#1A2A6C"
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "36b14711-e62b-452d-82bf-e8e7f9128fe6"
      }
    }
  }
}
```

---

## Development Setup

### 1. Install Dependencies

Dependencies are already installed:
```json
{
  "expo-notifications": "~0.32.16",
  "expo-device": "~8.0.10",
  "expo-constants": "~18.0.13"
}
```

### 2. Build Development Client

**⚠️ Important:** Push notifications do NOT work in Expo Go. You must use a development build.

```bash
# Login to EAS
eas login

# Build development clients
eas build --platform ios --profile development
eas build --platform android --profile development

# Or build both platforms
eas build --platform all --profile development
```

### 3. Install Development Build

```bash
# iOS: Install from TestFlight or direct download
# Android: Download APK from EAS build page and install

# Start dev server
npm run start:dev
```

### 4. Local Testing

On a physical device with the dev build:

1. **Grant Permissions**
   - On first launch, app will request notification permissions
   - Accept the prompt

2. **Verify Token Registration**
   - Check backend logs for: `POST /api/me/push-tokens 204`
   - Query Supabase:
     ```sql
     SELECT * FROM user_push_tokens
     WHERE user_id = '<your_user_id>';
     ```

3. **Test Notification**
   - Use two devices or accounts
   - Create a session and invite another user
   - Verify push notification received

---

## Production Configuration

### iOS — Apple Push Notifications (APNs)

#### Option A: EAS Managed Credentials (Recommended)

```bash
# Configure APNs key via EAS
eas credentials

# Select:
# > iOS
# > Push Notifications: Manage your Apple Push Notifications Key
# > Let EAS handle the push notification service key
```

EAS will:
- Generate an APNs key in your Apple Developer account
- Download and securely store the key
- Configure it for your app bundle ID

#### Option B: Manual APNs Key Setup

1. **Generate APNs Key in Apple Developer Portal**
   - Go to [developer.apple.com](https://developer.apple.com) → Certificates, IDs & Profiles
   - Keys → Create a new key
   - Enable "Apple Push Notifications service (APNs)"
   - Download the `.p8` file (save securely!)
   - Note the Key ID and Team ID

2. **Upload to EAS**
   ```bash
   eas credentials

   # Select:
   # > iOS
   # > Push Notifications: Manage your Apple Push Notifications Key
   # > Upload a new push notification service key

   # Provide:
   # - Key ID
   # - Team ID
   # - Path to .p8 file
   ```

#### Verification

```bash
# Check configured credentials
eas credentials --platform ios

# Should show:
# ✓ Push Notifications Key: Key ID xxxxx (Team ID: xxxxx)
```

### Android — Firebase Cloud Messaging (FCM)

#### Prerequisites

1. **Firebase Project**
   - Go to [console.firebase.google.com](https://console.firebase.google.com)
   - Create a project or use existing one
   - Note the project ID

2. **Enable Cloud Messaging API**
   - In Firebase Console → Project Settings → Cloud Messaging
   - Copy the "Server key" (legacy) or enable FCM API v1

#### Configure FCM in EAS

```bash
eas credentials

# Select:
# > Android
# > Push Notifications: Manage your FCM V1 API Key
# > Upload a new FCM API key

# Provide Firebase service account JSON:
# - Download from Firebase Console → Project Settings → Service Accounts
# - Upload the JSON file
```

#### Add google-services.json

The project keeps `googleServicesFile` in `app.config.ts` (and legacy `app.json`), pointing to `./lagalaga-sa-fb.json`.

Ensure this file exists in the project root:

```bash
# Download from Firebase Console
# Project Settings → General → Your apps → Android app
# Click "Download google-services.json"

# Place at project root
cp ~/Downloads/google-services.json ./lagalaga-sa-fb.json
```

Add to `.gitignore`:
```bash
echo "lagalaga-sa-fb.json" >> .gitignore
```

#### Verification

```bash
# Check configured credentials
eas credentials --platform android

# Should show:
# ✓ FCM V1 API Key: xxxxx
```

Android push setup checklist:
- `Constants.expoConfig?.extra?.eas?.projectId` resolves at runtime (or fallback `Constants.easConfig?.projectId`)
- `app.config.ts` includes `android.googleServicesFile: "./lagalaga-sa-fb.json"`
- `eas credentials --platform android` shows an FCM V1 API key configured
- Native app rebuilt after credential/config changes (`eas build --platform android` or `expo run:android`)

### Build Production Releases

Once credentials are configured:

```bash
# Build for iOS App Store
eas build --platform ios --profile production

# Build for Google Play
eas build --platform android --profile production

# Or build both
eas build --platform all --profile production
```

---

## Testing Procedures

### Unit Tests

No automated tests for push notifications (integration requires real devices).

### Manual Testing Checklist

#### Pre-flight Checks

- [ ] Development build installed on physical device
- [ ] Backend running and accessible
- [ ] Supabase database accessible
- [ ] Test user accounts created

#### Test Case 1: Token Registration

**Setup:** Fresh install or logged-out state

1. Launch app on physical device
2. Sign in with test account
3. Grant notification permissions when prompted
4. **Verify:**
   - Backend logs show `POST /api/me/push-tokens 204`
   - Query Supabase:
     ```sql
     SELECT expo_push_token, platform, last_seen_at
     FROM user_push_tokens
     WHERE user_id = '<test_user_id>';
     ```
   - Token should start with `ExponentPushToken[` or `ExpoPushToken[`
   - Platform should be `ios` or `android`

#### Test Case 2: Receive Push Notification

**Setup:** Two test accounts (User A = host, User B = guest)

1. Sign in as User B on Device B
2. Verify token registered (see Test Case 1)
3. Sign in as User A on Device A
4. Create a new session
5. Invite User B via friend picker
6. Submit session
7. **Verify:**
   - User B receives push notification within 5 seconds
   - Notification title: "Session Invite"
   - Notification body: "[Host] invited you to '[Session Title]'"
   - Notification appears in notification center

#### Test Case 3: Notification Tap (App Backgrounded)

1. Ensure Device B app is backgrounded (home button)
2. Tap the push notification
3. **Verify:**
   - App opens to invite screen (`/invites/[sessionId]`)
   - Session details displayed (title, game, host, player count)
   - "Accept" and "Decline" buttons visible

#### Test Case 4: Notification Tap (App Killed)

1. Force-quit app on Device B (swipe up in app switcher)
2. Send another invite from Device A
3. Tap notification on Device B
4. **Verify:**
   - App launches and navigates to invite screen
   - Navigation happens within 2 seconds of app launch

#### Test Case 5: Accept Invite

1. On invite screen, tap "Accept"
2. **Verify:**
   - Loading state shows briefly
   - Backend receives `POST /api/sessions/[id]/join`
   - Supabase `session_participants` state changes: `invited` → `joined`
   - App navigates to handoff screen

#### Test Case 6: Decline Invite

1. Receive another invite
2. Open invite screen
3. Tap "Decline"
4. **Verify:**
   - Backend receives `POST /api/sessions/[id]/decline-invite`
   - Supabase `session_participants` state changes: `invited` → `left`
   - App navigates back to sessions list

#### Test Case 7: Token Cleanup on Logout

1. Sign out on Device B
2. **Verify:**
   - Backend receives `DELETE /api/me/push-tokens`
   - Supabase token row deleted:
     ```sql
     SELECT COUNT(*) FROM user_push_tokens
     WHERE user_id = '<test_user_id>';
     -- Should return 0
     ```
3. Send another invite from Device A
4. **Verify:**
   - Device B does NOT receive push notification

#### Test Case 8: Multiple Devices

1. Sign in with same account on two devices
2. Verify both devices register tokens (different `expo_push_token`)
3. Send invite to that user
4. **Verify:**
   - Both devices receive push notification

#### Test Case 9: Edge Cases

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| **Permission denied** | Deny notification permissions | Token registration fails gracefully, no crash, app still usable |
| **Network failure** | Enable airplane mode, tap Accept | Shows error message, retry button appears |
| **Session full** | Session at max capacity, tap Accept | Shows "Session is at maximum capacity" error |
| **Already joined** | Tap Accept twice | Second tap is idempotent, navigates to handoff |
| **Already declined** | Decline, then open invite again | Shows "You declined this invite" with option to accept |
| **Session cancelled** | Host cancels session, open invite | Shows "This session is no longer available" |
| **Simulator** | Run on iOS Simulator or Android Emulator | Token registration fails gracefully, logs "requires physical device" |

---

## Monitoring & Debugging

### Backend Logs

Monitor push notification activity:

```bash
# Fastify logs (pino format)
grep "Push" /var/log/lagalaga-backend.log

# Key log messages:
# - "No push tokens for user, skipping notification"
# - "Expo Push API returned error"
# - "Push ticket error"
# - "Failed to send push notification batch"
```

### Database Queries

#### Active Tokens

```sql
-- All active push tokens
SELECT
  u.roblox_display_name,
  pt.expo_push_token,
  pt.platform,
  pt.last_seen_at
FROM user_push_tokens pt
JOIN app_users u ON pt.user_id = u.id
ORDER BY pt.last_seen_at DESC;
```

#### Stale Tokens (Cleanup)

```sql
-- Tokens not seen in 30+ days
SELECT
  user_id,
  expo_push_token,
  last_seen_at,
  AGE(NOW(), last_seen_at) as age
FROM user_push_tokens
WHERE last_seen_at < NOW() - INTERVAL '30 days'
ORDER BY last_seen_at ASC;

-- Cleanup query (run periodically)
DELETE FROM user_push_tokens
WHERE last_seen_at < NOW() - INTERVAL '60 days';
```

#### Notification Stats

```sql
-- Invites sent per day (via session_participants)
SELECT
  DATE(created_at) as date,
  COUNT(*) as invites_sent
FROM session_participants
WHERE state = 'invited'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 7;

-- Invite acceptance rate
SELECT
  COUNT(*) FILTER (WHERE state = 'joined') AS accepted,
  COUNT(*) FILTER (WHERE state = 'left') AS declined,
  COUNT(*) FILTER (WHERE state = 'invited') AS pending,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE state = 'joined') / NULLIF(COUNT(*), 0),
    2
  ) AS acceptance_rate_pct
FROM session_participants
WHERE state IN ('invited', 'joined', 'left');
```

### Expo Push Dashboard

**Not available** — Expo does not provide a web dashboard for push notifications.

However, you can use the Expo Push Tool for testing:
[https://expo.dev/notifications](https://expo.dev/notifications)

1. Paste an `ExponentPushToken[...]`
2. Send a test notification
3. Verify delivery

### Backend Metrics

If Prometheus metrics are enabled:

```bash
# Fetch push notification metrics
curl http://localhost:8080/metrics | grep push

# Example metrics:
# push_notifications_sent_total 1234
# push_notifications_failed_total 12
# push_notification_send_duration_seconds_bucket{le="0.5"} 1000
```

---

## Troubleshooting

### Issue: Notifications Not Received

**Symptoms:**
- Backend logs show push sent successfully
- Device does not receive notification

**Diagnosis:**

1. **Check Token Registration**
   ```sql
   SELECT * FROM user_push_tokens WHERE user_id = '<user_id>';
   ```
   - Token should exist
   - Token should start with `ExponentPushToken[`

2. **Check Device Permissions**
   - iOS: Settings → LagaLaga → Notifications → Allow Notifications (ON)
   - Android: Settings → Apps → LagaLaga → Notifications (ON)

3. **Check Backend Logs**
   ```bash
   grep "Push ticket error" backend.log
   ```
   Common errors:
   - `DeviceNotRegistered` → Token expired or invalid, delete from DB
   - `MessageTooBig` → Notification body too long
   - `InvalidCredentials` → APNs/FCM credentials issue

4. **Verify Credentials**
   ```bash
   eas credentials --platform ios
   eas credentials --platform android
   ```

5. **Test with Expo Push Tool**
   - Go to [expo.dev/notifications](https://expo.dev/notifications)
   - Paste the token
   - Send test notification
   - If this fails, credentials are misconfigured

**Resolution:**
- Invalid token → Delete from `user_push_tokens`, ask user to re-login
- Permission denied → Ask user to enable in system settings
- Credentials issue → Re-run `eas credentials` and upload valid keys

---

### Issue: Push Notifications in Expo Go

**Symptoms:**
- Using Expo Go app
- Notifications not working

**Diagnosis:**
Expo Go has limited push notification support. You cannot test full push flows.

**Resolution:**
Build a development client:
```bash
eas build --platform ios --profile development
eas build --platform android --profile development
```

---

### Issue: Token Registration Fails on Physical Device

**Symptoms:**
- Running on physical device
- Backend never receives `POST /api/me/push-tokens`
- Frontend logs: "Failed to register push token"

**Diagnosis:**

1. **Check Build Type**
   - Is this a development build or Expo Go?
   - Expo Go: Limited support, build dev client

2. **Check EAS Project ID**
   ```typescript
   // src/features/notifications/registerPushToken.ts
   const projectId = Constants.expoConfig?.extra?.eas?.projectId;
   console.log('EAS Project ID:', projectId);
   ```
   - Should log: `36b14711-e62b-452d-82bf-e8e7f9128fe6`
   - If undefined, check `app.json`:
     ```json
     "extra": {
       "eas": {
         "projectId": "36b14711-e62b-452d-82bf-e8e7f9128fe6"
       }
     }
     ```

3. **Check Firebase Configuration (Android)**
   - Verify `lagalaga-sa-fb.json` exists in project root
   - Rebuild app with `eas build`

4. **Check Frontend Logs**
   ```bash
   # In dev console
   grep -i "push" metro.log
   ```
   Look for:
   - "Push tokens not supported on web, skipping" (expected on web)
   - "Push tokens require physical device" (expected on simulator)
   - "Missing EAS project ID" (config issue)
   - "Failed to register push token" (check error details)

**Resolution:**
- Missing project ID → Add to `app.json` and rebuild
- Android FCM errors → Re-download `google-services.json` and rebuild
- iOS APNs errors → Re-run `eas credentials --platform ios`

---

### Issue: Backend Returns 500 on Push Send

**Symptoms:**
- Session created with invites
- Backend logs: `Failed to send push notification batch`
- HTTP 500 from Expo Push API

**Diagnosis:**

1. **Check Expo API Response**
   ```bash
   # Backend logs (JSON format)
   grep "Expo Push API returned error" backend.log | jq
   ```

2. **Common Expo API Errors:**
   - **429 Too Many Requests** → Rate limited, implement backoff
   - **503 Service Unavailable** → Expo Push API down, retry later
   - **400 Bad Request** → Malformed token or payload

3. **Validate Token Format**
   ```sql
   SELECT expo_push_token FROM user_push_tokens LIMIT 10;
   ```
   - Should start with `ExponentPushToken[` or `ExpoPushToken[`
   - Should end with `]`

**Resolution:**
- Rate limited → Implement exponential backoff (already in code: 5s timeout)
- Invalid tokens → Delete from DB:
  ```sql
  DELETE FROM user_push_tokens
  WHERE expo_push_token NOT LIKE 'Expo%PushToken[%]';
  ```

---

### Issue: Notification Tap Doesn't Navigate

**Symptoms:**
- Notification received
- User taps notification
- App opens but stays on current screen

**Diagnosis:**

1. **Check Notification Data**
   - Backend sends:
     ```typescript
     {
       type: 'session_invite',
       sessionId: '<uuid>'
     }
     ```
   - Verify in backend logs

2. **Check Frontend Handler**
   ```typescript
   // src/features/notifications/notificationHandlers.ts
   function handleNotificationResponse(response) {
     const data = response.notification.request.content.data;
     console.log('Notification data:', data);
   }
   ```
   - Add logging to verify data received

3. **Check Route Registration**
   - Verify `app/invites/[sessionId].tsx` exists
   - Verify `app/_layout.tsx` includes:
     ```tsx
     <Stack.Screen name="invites" options={{ headerShown: false }} />
     ```

**Resolution:**
- Missing data → Check backend send logic
- Wrong route → Ensure route file exists and is registered
- Cold start issue → Check `setupNotificationListeners()` called in `_layout.tsx`

---

### Issue: "DeviceNotRegistered" Errors

**Symptoms:**
- Backend logs: `Push ticket error: DeviceNotRegistered`
- Notifications not delivered to specific devices

**Diagnosis:**
Token is no longer valid (user uninstalled app, revoked permissions, or token expired).

**Resolution:**
Implement automated cleanup (recommendation):

```typescript
// backend/src/jobs/cleanupPushTokens.ts
import { PushNotificationService } from '../services/pushNotificationService.js';

export async function cleanupInvalidTokens() {
  const supabase = getSupabase();

  // Mark tokens that returned DeviceNotRegistered
  // This requires extending PushNotificationService to track failures

  // Delete tokens older than 60 days
  await supabase
    .from('user_push_tokens')
    .delete()
    .lt('last_seen_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());
}
```

Run as a cron job daily.

---

## Security Considerations

### Token Storage

- ✅ Tokens stored in Supabase with RLS enabled
- ✅ Only backend (service role) can read/write tokens
- ✅ Tokens associated with `user_id` (no anonymous tokens)

### Token Cleanup

- ⚠️ No automated cleanup implemented
- **Recommendation:** Implement periodic cleanup job (see above)

### Push Payload Security

- ✅ No sensitive data in push payload (only session ID)
- ✅ Invite details fetched after authentication
- ✅ Authorization enforced in `GET /api/sessions/:id/invite-details`

### Rate Limiting

- ⚠️ No rate limiting on push sends
- **Recommendation:** Add rate limit to prevent abuse:
  ```typescript
  // backend/src/routes/sessions-v2.ts
  // Limit: 10 invites per session
  if (invitedRobloxUserIds.length > 10) {
    throw new ValidationError('Maximum 10 invites per session');
  }
  ```

### Credential Management

- ✅ APNs keys and FCM keys stored in EAS (encrypted at rest)
- ✅ `google-services.json` excluded from git
- ⚠️ Ensure `.gitignore` includes:
  ```
  google-services.json
  GoogleService-Info.plist
  lagalaga-sa-fb.json
  ```

---

## Maintenance Tasks

### Daily

- [ ] Monitor error logs for push failures
- [ ] Check Supabase for stale tokens (>30 days)

### Weekly

- [ ] Review acceptance rate metrics
- [ ] Verify credential expiration dates (APNs keys expire after 1 year)

### Monthly

- [ ] Clean up tokens older than 60 days
- [ ] Review notification delivery rates
- [ ] Update this runbook with new issues/resolutions

### Quarterly

- [ ] Test end-to-end push flow on staging
- [ ] Verify APNs and FCM credentials still valid
- [ ] Update dependencies: `expo-notifications`, `expo-device`

---

## References

### External Documentation

- [Expo Push Notifications Guide](https://docs.expo.dev/push-notifications/overview/)
- [Apple APNs Documentation](https://developer.apple.com/documentation/usernotifications)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)

### Internal Documentation

- [Implementation Guide](../features/push-notification-invites.md)
- [Original Requirements](../features/notifications.md)
- [Session Service v2](../../backend/src/services/sessionService-v2.ts)
- [Push Notification Service](../../backend/src/services/pushNotificationService.ts)

### Helpful Commands

```bash
# Check EAS account and projects
eas whoami
eas project:info

# View build logs
eas build:list
eas build:view <build-id>

# View credentials
eas credentials --platform ios
eas credentials --platform android

# Submit to app stores
eas submit --platform ios
eas submit --platform android
```

---

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-17 | Claude Code | Initial runbook creation |
