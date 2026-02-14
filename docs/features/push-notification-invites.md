# Push Notification Invites — Implementation Guide

> **Status:** Specification (no code changes yet)
> **Author:** Claude Code, Feb 2026
> **Depends on:** Existing session creation flow, `session_invited_roblox` table, `app_users` table

## Overview

When a host creates a session and selects friends via `FriendPickerTwoRowHorizontal`, their Roblox IDs are stored in `session_invited_roblox`. This feature adds push notification infrastructure so that invited friends receive a push notification and can accept/decline from a dedicated invite screen.

### Flow Summary

1. Host creates session with invited friends (existing)
2. Backend resolves `roblox_user_id` -> `app_users.id` for each invitee
3. Backend inserts `session_participants` rows with `state='invited'` for resolved users
4. Backend sends push notification to each invitee's registered devices (fire-and-forget)
5. Invitee taps notification -> app opens `app/invites/[sessionId].tsx`
6. Invitee sees session preview, taps Accept (calls existing `POST /api/sessions/:id/join`) or Decline (`POST /api/sessions/:id/decline-invite`)

---

## Part A: Prerequisites & Setup

### A.1 Install Dependencies

```bash
# From project root
npx expo install expo-notifications expo-device
```

`expo-constants` is already installed (`~18.0.13` in package.json).

### A.2 Update `app.json` Plugins

Add the `expo-notifications` plugin to the existing `plugins` array:

```jsonc
// app.json → expo.plugins
[
  "expo-router",
  ["expo-splash-screen", { /* existing config */ }],
  "expo-sqlite",
  ["expo-font", { /* existing config */ }],
  // ADD:
  [
    "expo-notifications",
    {
      "icon": "./assets/generated/icon.png",
      "color": "#1A2A6C"
    }
  ]
]
```

### A.3 EAS Project ID

Already configured in `app.json`:

```json
"extra": {
  "eas": {
    "projectId": "36b14711-e62b-452d-82bf-e8e7f9128fe6"
  }
}
```

This is used by `Notifications.getExpoPushTokenAsync({ projectId })`.

### A.4 Development Build Requirement

Push notifications **do not work in Expo Go**. You must use a development build:

```bash
# Build dev clients (already configured in eas.json)
eas build --platform ios --profile development
eas build --platform android --profile development

# Start with dev client
npm run start:dev
```

The existing `eas.json` already has a `development` profile with `"developmentClient": true`.

### A.5 Platform Credentials (iOS APNs + Android FCM)

#### iOS — APNs Key

```bash
eas credentials --platform ios
# Select "Push Notifications: Manage your Apple Push Notifications Key"
# EAS will generate/upload the key automatically
```

Alternatively, create a key manually in Apple Developer Portal > Keys > Add Key > "Apple Push Notifications service (APNs)", then upload via `eas credentials`.

#### Android — FCM

```bash
eas credentials --platform android
# Select "Push Notifications: Manage your FCM V1 API Key"
# Follow prompts to link Firebase project
```

For Android, you also need a `google-services.json` in the project root (for FCM). EAS handles this during `eas credentials`.

---

## Part B: Database Migration

### B.1 New Table: `user_push_tokens`

```sql
-- Migration: add_user_push_tokens
-- Push notification tokens for Expo Push service.
-- Managed exclusively by the backend (service role). No client RLS policies needed.

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

-- Fast lookup: all tokens for a user (used when sending push)
CREATE INDEX idx_user_push_tokens_user_id
  ON public.user_push_tokens (user_id);

-- Cleanup: find stale tokens (not seen in 30+ days)
CREATE INDEX idx_user_push_tokens_last_seen
  ON public.user_push_tokens (last_seen_at);

-- RLS: enabled but service-role only (backend manages all rows)
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

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
```

### B.2 No New Invite Table

We reuse `session_participants` with the existing `state='invited'` value. The `ParticipantState` enum already includes `'invited' | 'joined' | 'left' | 'kicked'` (defined in `backend/src/services/sessionService-v2.ts:12`).

The flow:
- **Invite sent** -> `session_participants` row with `state='invited'`, `role='member'`
- **Accept** -> update `state` to `'joined'` (via existing `joinSession()`)
- **Decline** -> update `state` to `'left'`

### B.3 Migration File Location

Create: `supabase/migrations/YYYYMMDDHHMMSS_add_user_push_tokens.sql`

Use the SQL from B.1 above. Follow the existing migration naming convention visible in `supabase/migrations/`.

---

## Part C: Backend Changes

### C.1 Push Token Endpoints

**File:** `backend/src/routes/me.routes.ts`

Add two routes inside the existing `buildMeRoutes()` function:

#### `POST /api/me/push-tokens` — Upsert Token

```typescript
fastify.post<{
  Body: {
    expoPushToken: string;
    deviceId?: string;
    platform?: string;
  };
}>(
  '/push-tokens',
  {
    preHandler: authPreHandler,
    schema: {
      body: {
        type: 'object',
        required: ['expoPushToken'],
        properties: {
          expoPushToken: { type: 'string' },
          deviceId: { type: 'string' },
          platform: { type: 'string', enum: ['ios', 'android', 'web'] },
        },
      },
    },
  },
  async (request, reply) => {
    const { expoPushToken, deviceId, platform } = request.body;

    // Minimal validation: must look like an Expo push token
    if (
      !expoPushToken.startsWith('ExponentPushToken[') &&
      !expoPushToken.startsWith('ExpoPushToken[')
    ) {
      throw new ValidationError('Invalid Expo push token format');
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        {
          user_id: request.user.userId,
          expo_push_token: expoPushToken,
          device_id: deviceId || null,
          platform: platform || null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_push_token' }
      );

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to upsert push token: ${error.message}`
      );
    }

    return reply.status(204).send();
  }
);
```

#### `DELETE /api/me/push-tokens` — Remove on Logout

```typescript
fastify.delete<{
  Body: { expoPushToken: string };
}>(
  '/push-tokens',
  {
    preHandler: authPreHandler,
    schema: {
      body: {
        type: 'object',
        required: ['expoPushToken'],
        properties: {
          expoPushToken: { type: 'string' },
        },
      },
    },
  },
  async (request, reply) => {
    const supabase = getSupabase();
    await supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', request.user.userId)
      .eq('expo_push_token', request.body.expoPushToken);

    return reply.status(204).send();
  }
);
```

**Imports to add** in `me.routes.ts`:
```typescript
import { getSupabase } from '../config/supabase.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { ErrorCodes } from '../utils/errors.js';
```

**Note:** These routes will be registered at `/api/me/push-tokens` because the me routes are mounted at `/api/me` (see the server route registration).

### C.2 PushNotificationService

**New file:** `backend/src/services/pushNotificationService.ts`

```typescript
import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { request } from 'undici';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TIMEOUT_MS = 5000;
const BATCH_SIZE = 100; // Expo recommends max 100 per request

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  channelId?: string;
}

export class PushNotificationService {
  /**
   * Get all active push tokens for a user
   */
  async getUserPushTokens(userId: string): Promise<string[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to fetch push tokens');
      return [];
    }

    return (data ?? []).map((row) => row.expo_push_token);
  }

  /**
   * Send session invite push notification to a user
   * Fire-and-forget: logs errors but does not throw
   */
  async sendSessionInviteNotification(
    userId: string,
    sessionId: string,
    sessionTitle: string,
    hostDisplayName?: string
  ): Promise<void> {
    const tokens = await this.getUserPushTokens(userId);
    if (tokens.length === 0) {
      logger.info({ userId, sessionId }, 'No push tokens for user, skipping notification');
      return;
    }

    const body = hostDisplayName
      ? `${hostDisplayName} invited you to "${sessionTitle}"`
      : `You've been invited to "${sessionTitle}"`;

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title: 'Session Invite',
      body,
      data: {
        type: 'session_invite',
        sessionId,
      },
      sound: 'default',
    }));

    await this.sendPushBatch(messages);
  }

  /**
   * Send push messages in batches of 100
   */
  private async sendPushBatch(messages: ExpoPushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      try {
        const response = await request(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
        });

        if (response.statusCode >= 400) {
          const body = await response.body.text();
          logger.error(
            { statusCode: response.statusCode, body },
            'Expo Push API returned error'
          );
        } else {
          const result = await response.body.json();
          // Log individual ticket errors (e.g. DeviceNotRegistered)
          if (result?.data) {
            for (const ticket of result.data) {
              if (ticket.status === 'error') {
                logger.warn(
                  { message: ticket.message, details: ticket.details },
                  'Push ticket error'
                );
              }
            }
          }
        }
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'Failed to send push notification batch'
        );
      }
    }
  }
}
```

### C.3 Modify Session Creation

**File:** `backend/src/services/sessionService-v2.ts`

After the `session_invited_roblox` insert block (around line 338), add the roblox-to-app-user resolution and push notification send:

```typescript
// --- NEW: Resolve invited Roblox users → app_users and send push notifications ---
if (invitedRobloxUserIds.length > 0) {
  // Resolve roblox_user_id → app_users.id
  const { data: resolvedUsers, error: resolveError } = await supabase
    .from('app_users')
    .select('id, roblox_user_id, roblox_display_name')
    .in(
      'roblox_user_id',
      invitedRobloxUserIds.map(String)
    );

  if (resolveError) {
    logger.warn(
      { error: resolveError.message, sessionId: sessionData.id },
      'Failed to resolve invited Roblox users to app_users'
    );
  }

  const appUsers = resolvedUsers ?? [];
  const hostUserId = input.hostUserId;

  // Insert session_participants with state='invited' for each resolved user
  for (const appUser of appUsers) {
    if (appUser.id === hostUserId) continue; // Skip if host invited themselves

    const participantError = await this.insertParticipant(supabase, {
      session_id: sessionData.id,
      user_id: appUser.id,
      role: 'member',
      state: 'invited',
      handoff_state: 'rsvp_joined',
    });

    if (participantError) {
      logger.warn(
        { userId: appUser.id, sessionId: sessionData.id, error: participantError.message },
        'Failed to insert invited participant'
      );
    }
  }

  // Fire-and-forget: send push notifications
  const pushService = new PushNotificationService();
  for (const appUser of appUsers) {
    if (appUser.id === hostUserId) continue;

    pushService
      .sendSessionInviteNotification(
        appUser.id,
        sessionData.id,
        input.title,
        undefined // host display name can be added later
      )
      .catch((err) => {
        logger.warn(
          { userId: appUser.id, sessionId: sessionData.id, error: err.message },
          'Push notification send failed'
        );
      });
  }
}
```

**Import to add** at top of `sessionService-v2.ts`:
```typescript
import { PushNotificationService } from './pushNotificationService.js';
```

### C.4 Invite Detail Endpoint

**File:** `backend/src/routes/sessions-v2.ts`

Add a new route for getting invite details (used by the invite screen):

```typescript
/**
 * GET /api/sessions/:id/invite-details
 * Get session preview for an invited user
 * Returns session info + host profile for the invite screen
 */
fastify.get<{
  Params: { id: string };
}>(
  '/api/sessions/:id/invite-details',
  {
    preHandler: authPreHandler,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
          },
        },
      },
    },
  },
  async (request, reply) => {
    const supabase = getSupabase();
    const sessionId = request.params.id;
    const userId = request.user.userId;

    // Verify user is an invited participant
    const { data: participant } = await supabase
      .from('session_participants')
      .select('state')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    // Allow access if invited, joined, or left (so they can see what they declined)
    if (!participant) {
      throw new NotFoundError('Session invite', sessionId);
    }

    // Get full session details (reuse existing service method)
    const session = await sessionService.getSessionById(sessionId, userId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    return reply.send({
      success: true,
      data: {
        session,
        participantState: participant.state,
      },
      requestId: String(request.id),
    });
  }
);
```

### C.5 Decline Invite Endpoint

**File:** `backend/src/routes/sessions-v2.ts`

```typescript
/**
 * POST /api/sessions/:id/decline-invite
 * Decline a session invite (sets participant state to 'left')
 */
fastify.post<{
  Params: { id: string };
}>(
  '/api/sessions/:id/decline-invite',
  {
    preHandler: authPreHandler,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
          },
        },
      },
    },
  },
  async (request, reply) => {
    const supabase = getSupabase();
    const sessionId = request.params.id;
    const userId = request.user.userId;

    // Verify user has a pending invite
    const { data: participant, error: lookupError } = await supabase
      .from('session_participants')
      .select('state')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupError || !participant) {
      throw new NotFoundError('Session invite', sessionId);
    }

    if (participant.state !== 'invited') {
      throw new ValidationError(
        `Cannot decline invite: current state is '${participant.state}'`
      );
    }

    const { error: updateError } = await supabase
      .from('session_participants')
      .update({ state: 'left' })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (updateError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to decline invite: ${updateError.message}`
      );
    }

    return reply.send({
      success: true,
      requestId: String(request.id),
    });
  }
);
```

**Additional imports** needed at top of `sessions-v2.ts`:
```typescript
import { AppError, ErrorCodes } from '../utils/errors.js';
```

### C.6 Join Flow Update

**File:** `backend/src/services/sessionService-v2.ts` — `joinSession()` method

The existing `joinSession()` method already handles the `invited` -> `joined` transition correctly. At line 836 it calls `upsertParticipant()` which will update the existing `state='invited'` row to `state='joined'`. The idempotency check at line 828 also handles the case where they've already joined.

No changes needed. The only behavioral note: when an invited user taps "Accept", the frontend calls `POST /api/sessions/:id/join` with no `inviteCode` body. The existing code path:

1. Checks session exists and capacity (passes because invited users don't count toward `state='joined'` count)
2. Finds existing participant with `state='invited'` (line 821-826)
3. Since `existing.state !== 'joined'`, falls through to the upsert at line 836
4. Upserts with `state='joined'`, preserving original `joined_at` if present

**One consideration:** For `invite_only` sessions, the current code at line 786 requires an `inviteCode` in the body. Since push-invited users won't have the shareable invite code, the join endpoint should also allow joining if the user already has `state='invited'` in `session_participants`. Add a check before the invite code validation:

```typescript
// Allow joining if user already has an invite (push notification flow)
if (session.visibility === 'invite_only' && !inviteCode) {
  // Check if user was directly invited via push notification
  const { data: directInvite } = await supabase
    .from('session_participants')
    .select('state')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('state', 'invited')
    .maybeSingle();

  if (!directInvite) {
    throw new SessionError(ErrorCodes.FORBIDDEN, 'This session requires an invite code', 403);
  }
  // User was directly invited — allow join without invite code
}
```

This replaces the existing simple check at line 786-788.

---

## Part D: Frontend Changes

### D.1 Token Registration

**New file:** `src/features/notifications/registerPushToken.ts`

```typescript
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { logger } from '@/src/lib/logger';
import { apiClient } from '@/src/lib/api';

let cachedToken: string | null = null;

/**
 * Request notification permissions, get Expo push token, and register with backend.
 * Safe to call multiple times — backend upserts.
 * No-ops on web and simulator.
 */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    logger.info('Push tokens not supported on web, skipping');
    return null;
  }

  if (!Device.isDevice) {
    logger.info('Push tokens require physical device, skipping on simulator');
    return null;
  }

  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('Push notification permission denied');
      return null;
    }

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      logger.error('Missing EAS project ID for push token registration');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;

    // Register with backend
    await apiClient.me.registerPushToken({
      expoPushToken: token,
      platform: Platform.OS as 'ios' | 'android',
    });

    cachedToken = token;
    logger.info('Push token registered', { platform: Platform.OS });
    return token;
  } catch (err) {
    logger.error('Failed to register push token', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Unregister push token on logout.
 * Call before clearing auth tokens.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!cachedToken) return;

  try {
    await apiClient.me.unregisterPushToken({ expoPushToken: cachedToken });
    cachedToken = null;
    logger.info('Push token unregistered');
  } catch (err) {
    logger.warn('Failed to unregister push token', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

### D.2 Notification Handlers

**New file:** `src/features/notifications/notificationHandlers.ts`

```typescript
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { logger } from '@/src/lib/logger';

/**
 * Configure foreground notification display.
 * Call once at app startup.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Route to the appropriate screen based on notification data.
 */
function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const data = response.notification.request.content.data;

  if (data?.type === 'session_invite' && data?.sessionId) {
    const sessionId = String(data.sessionId);
    logger.info('Navigating to invite screen from notification', { sessionId });

    router.push({
      pathname: '/invites/[sessionId]',
      params: { sessionId },
    });
  }
}

/**
 * Set up notification response listeners for warm-start and cold-start.
 * Returns cleanup function.
 */
export function setupNotificationListeners(): () => void {
  // Warm start: user taps notification while app is running/backgrounded
  const subscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse
  );

  // Cold start: user tapped notification to launch the app
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handleNotificationResponse(response);
    }
  });

  return () => {
    subscription.remove();
  };
}
```

### D.3 Root Layout Integration

**File:** `app/_layout.tsx`

Add notification setup inside `RootLayout`:

```typescript
// Add imports at top:
import {
  configureNotificationHandler,
  setupNotificationListeners,
} from '@/src/features/notifications/notificationHandlers';

// Call configureNotificationHandler() OUTSIDE the component (module-level):
configureNotificationHandler();

// Inside RootLayout component, add a useEffect:
useEffect(() => {
  const cleanup = setupNotificationListeners();
  return cleanup;
}, []);
```

Add the `invites` Stack.Screen inside the `<Stack>`:

```tsx
<Stack.Screen
  name="invites"
  options={{ headerShown: false }}
/>
```

The full Stack becomes:
```tsx
<Stack>
  <Stack.Screen name="index" options={{ headerShown: false }} />
  <Stack.Screen name="auth" options={{ headerShown: false }} />
  <Stack.Screen name="sessions" options={{ headerShown: false }} />
  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  <Stack.Screen name="me" options={{ headerShown: true, title: 'Me' }} />
  <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
  <Stack.Screen name="invites" options={{ headerShown: false }} />
</Stack>
```

### D.4 Auth Integration

**File:** `src/features/auth/useAuth.tsx`

#### After Login (in `loadUser`):

After line 57 (`void warmFavorites(me.id);`), add:

```typescript
import { registerPushToken } from '../notifications/registerPushToken';

// Inside loadUser(), after setUser(userData):
void registerPushToken();
```

#### On Logout (in `signOut`):

Before `await tokenStorage.clearTokens();`, add:

```typescript
import { unregisterPushToken } from '../notifications/registerPushToken';

// Inside signOut(), before clearing tokens:
try {
  await unregisterPushToken();
} catch {
  // Best-effort, don't block logout
}
```

### D.5 Invite Screen

**New directory:** `app/invites/`

**New file:** `app/invites/_layout.tsx`

```tsx
import { Stack } from 'expo-router';

export default function InvitesLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="[sessionId]"
        options={{ title: 'Session Invite' }}
      />
    </Stack>
  );
}
```

**New file:** `app/invites/[sessionId].tsx`

This screen:
1. Calls `GET /api/sessions/:id/invite-details` on mount
2. Shows session preview (game thumbnail, title, host name, player count)
3. Shows Accept/Decline buttons
4. Accept calls `POST /api/sessions/:id/join` then navigates to handoff
5. Decline calls `POST /api/sessions/:id/decline-invite` then navigates to sessions list

Pattern reference: `app/invite/[code].tsx` (existing invite-code screen).

Key differences from the invite-code screen:
- No invite code needed — user is already a `session_participants` row
- Uses `sessionId` param (UUID) instead of `code` (alphanumeric)
- Decline button is new (invite-code screen doesn't have decline)
- `participantState` from the response determines button states (e.g., already accepted)

### D.6 API Client Updates

**File:** `src/lib/api.ts`

Add a `me` namespace to `ApiClient`:

```typescript
me = {
  registerPushToken: async (input: {
    expoPushToken: string;
    platform?: string;
  }): Promise<void> => {
    await this.request('/api/me/push-tokens', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  unregisterPushToken: async (input: {
    expoPushToken: string;
  }): Promise<void> => {
    await this.request('/api/me/push-tokens', {
      method: 'DELETE',
      body: JSON.stringify(input),
    });
  },
};
```

**File:** `src/features/sessions/apiStore-v2.ts`

Add methods to `SessionsAPIStoreV2`:

```typescript
/**
 * Get invite details for a session the user was invited to
 */
async getInviteDetails(sessionId: string): Promise<{
  session: SessionDetail;
  participantState: string;
}> {
  const response = await fetchWithAuth<{
    success: boolean;
    data: { session: SessionDetail; participantState: string };
  }>(`/api/sessions/${sessionId}/invite-details`);

  if (!response.success) {
    throw new ApiError({
      code: 'NOT_FOUND_002',
      message: 'Invite not found',
      statusCode: 404,
    });
  }

  return response.data;
}

/**
 * Decline a session invite
 */
async declineInvite(sessionId: string): Promise<void> {
  const response = await fetchWithAuth<{ success: boolean }>(
    `/api/sessions/${sessionId}/decline-invite`,
    { method: 'POST' }
  );

  if (!response.success) {
    throw new ApiError({
      code: 'SESSION_008',
      message: 'Failed to decline invite',
      statusCode: 400,
    });
  }
}
```

---

## Part E: Platform Config Summary

| Platform | Credential | How to Set Up |
|----------|-----------|---------------|
| iOS | APNs Key | `eas credentials --platform ios` > Push Notifications |
| Android | FCM V1 Key | `eas credentials --platform android` > Push Notifications |

After credentials are configured:

```bash
# Build development clients with push support
eas build --platform ios --profile development
eas build --platform android --profile development

# Or build both:
eas build --platform all --profile development
```

For production builds, credentials carry over:

```bash
eas build --platform all --profile production
```

---

## Part F: E2E Test Plan (Two Real Devices)

### Prerequisites
- Two physical devices (or one device + one emulator with dev build)
- Two separate user accounts (User A = host, User B = guest)
- Both users must be Roblox friends (for the friend picker)
- Dev build installed on both devices

### Test Steps

#### 1. Token Registration
1. Sign in as User B on Device B
2. Grant notification permission when prompted
3. Verify in backend logs: `POST /api/me/push-tokens` 204 response
4. Verify in Supabase: `SELECT * FROM user_push_tokens WHERE user_id = '<B_user_id>'` shows a row

#### 2. Session Creation with Invite
1. Sign in as User A on Device A
2. Create a new session
3. In the friend picker, select User B
4. Submit session creation
5. Verify in Supabase:
   - `session_invited_roblox` has User B's roblox_user_id
   - `session_participants` has a row for User B with `state='invited'`
6. Verify User B receives a push notification on Device B:
   - Title: "Session Invite"
   - Body: "You've been invited to `<session title>`"

#### 3. Notification Tap — App Backgrounded
1. With the lagalaga app backgrounded on Device B, tap the push notification
2. Verify the app opens to `app/invites/[sessionId]`
3. Verify the invite screen shows:
   - Session title
   - Game name and thumbnail (if available)
   - Host info
   - Player count
   - Accept and Decline buttons

#### 4. Notification Tap — App Killed (Cold Start)
1. Force-quit the lagalaga app on Device B
2. Send another invite (create a new session from Device A)
3. Tap the notification on Device B
4. Verify the app launches and navigates to the invite screen

#### 5. Notification Tap — App Foregrounded
1. With the lagalaga app open on Device B
2. Send another invite from Device A
3. Verify an in-app notification banner appears
4. Tap the banner
5. Verify navigation to the invite screen

#### 6. Accept Invite
1. On the invite screen, tap "Accept"
2. Verify:
   - `POST /api/sessions/:id/join` returns success
   - `session_participants.state` updates from `'invited'` to `'joined'`
   - App navigates to the handoff screen (`/sessions/handoff`)

#### 7. Decline Invite
1. Create another session from Device A inviting User B
2. On Device B, navigate to the invite screen
3. Tap "Decline"
4. Verify:
   - `POST /api/sessions/:id/decline-invite` returns success
   - `session_participants.state` updates from `'invited'` to `'left'`
   - App navigates back to sessions list

#### 8. Token Cleanup on Logout
1. On Device B, sign out
2. Verify in backend logs: `DELETE /api/me/push-tokens` was called
3. Verify in Supabase: `user_push_tokens` row for Device B is removed
4. Send another invite from Device A
5. Verify Device B does **not** receive a push notification

#### 9. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Session is full | Accept button should show error: "This session is at maximum capacity" |
| Already joined | Accept should be idempotent, navigate to handoff |
| Already declined | Screen shows "You declined this invite" with option to accept |
| Session cancelled | Screen shows "This session is no longer available" |
| Network failure | Inline error with retry button, no crash |
| Web/Simulator | `registerPushToken()` is a safe no-op |
| Multiple devices | All devices with registered tokens receive the push |

---

## Part G: Commit Plan

Suggested commit sequence for implementation:

### Commit 1: Database migration
```
feat(db): add user_push_tokens table for push notification support
```
- Create `supabase/migrations/YYYYMMDDHHMMSS_add_user_push_tokens.sql`

### Commit 2: Backend push infrastructure
```
feat(backend): add push token registration and notification service
```
- `backend/src/services/pushNotificationService.ts` (new)
- `backend/src/routes/me.routes.ts` (add push-token endpoints)
- Add necessary imports

### Commit 3: Backend invite endpoints + session creation wiring
```
feat(backend): wire push notifications into session creation flow
```
- `backend/src/services/sessionService-v2.ts` (resolve roblox IDs, insert participants, send push)
- `backend/src/routes/sessions-v2.ts` (add invite-details and decline-invite endpoints)
- Update `joinSession()` to allow invited users on invite_only sessions

### Commit 4: Frontend notification setup
```
feat(app): register push tokens and handle notification routing
```
- `src/features/notifications/registerPushToken.ts` (new)
- `src/features/notifications/notificationHandlers.ts` (new)
- `app/_layout.tsx` (add notification listeners + invites screen)
- `src/features/auth/useAuth.tsx` (register on login, unregister on logout)
- `app.json` (add expo-notifications plugin)

### Commit 5: Invite screen
```
feat(app): invite screen with accept/decline flow
```
- `app/invites/_layout.tsx` (new)
- `app/invites/[sessionId].tsx` (new)
- `src/lib/api.ts` (add me.registerPushToken, me.unregisterPushToken)
- `src/features/sessions/apiStore-v2.ts` (add getInviteDetails, declineInvite)

---

## Appendix: File Inventory

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_add_user_push_tokens.sql` | Push tokens table DDL |
| `backend/src/services/pushNotificationService.ts` | Expo Push API helper |
| `src/features/notifications/registerPushToken.ts` | Frontend token registration |
| `src/features/notifications/notificationHandlers.ts` | Notification tap routing |
| `app/invites/_layout.tsx` | Invites route layout |
| `app/invites/[sessionId].tsx` | Invite accept/decline screen |

### Modified Files
| File | Changes |
|------|---------|
| `app.json` | Add `expo-notifications` plugin |
| `app/_layout.tsx` | Add notification listeners, `invites` Stack.Screen |
| `backend/src/routes/me.routes.ts` | Add `POST/DELETE /api/me/push-tokens` |
| `backend/src/routes/sessions-v2.ts` | Add `GET invite-details`, `POST decline-invite` |
| `backend/src/services/sessionService-v2.ts` | Resolve invitees + insert participants + send push |
| `src/features/auth/useAuth.tsx` | Register token on login, unregister on logout |
| `src/lib/api.ts` | Add `me.registerPushToken`, `me.unregisterPushToken` |
| `src/features/sessions/apiStore-v2.ts` | Add `getInviteDetails()`, `declineInvite()` |
