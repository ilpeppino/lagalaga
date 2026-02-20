# LagaLaga Architecture

## 1. Overview

LagaLaga is a mobile-first social gaming platform that helps users organize and join Roblox gaming sessions. The application uses a hybrid architecture with:

- **Expo React Native** mobile app (iOS, Android, Web)
- **Fastify Node.js/TypeScript** backend API
- **Supabase PostgreSQL** database
- **Roblox OAuth 2.0** for authentication

The system employs a **backend-mediated architecture** where the mobile app never directly accesses the database. All data operations flow through a secure backend API that manages authentication, authorization, and data access.

### Platforms
- iOS (via Expo)
- Android (via Expo)
- Web (via Expo Web)

### Current Authentication Strategy
Backend-mediated Roblox OAuth 2.0 with PKCE (Proof Key for Code Exchange). Users authenticate via Roblox, and the backend issues custom JWT tokens for subsequent API requests. The frontend never receives Supabase credentials.

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Mobile/Web App (Expo)                       │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────┐  │
│  │  Auth   │  │ Sessions │  │ Friends │  │  Error Handling  │  │
│  │ Context │  │  Stores  │  │  Lists  │  │  & Monitoring    │  │
│  └─────────┘  └──────────┘  └─────────┘  └──────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Push Tokens    │  │   Presence      │  │   Favorites     │ │
│  │  Registration   │  │   Tracking      │  │   Cache         │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│         │                          │                            │
│         └──────────────────────────┴────────────────────────────│
│                          │                                      │
│                    HTTP (Bearer JWT)                            │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend API (Fastify/Node.js)                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐   │
│  │   Auth   │  │ Sessions │  │  Friends  │  │   Presence   │   │
│  │  Routes  │  │  Routes  │  │  Routes   │  │   Routes     │   │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐   │
│  │ Roblox   │  │   Me     │  │  Health/  │  │   Roblox     │   │
│  │ Service  │  │  Routes  │  │  Metrics  │  │   Connect    │   │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘   │
│         │            │              │                           │
│         └────────────┴──────────────┘                           │
│                      │                                          │
│            Service-Role Client                                  │
│                      │                                          │
└──────────────────────┼──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Supabase PostgreSQL                           │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────────────┐  │
│  │  app_users   │  │  games   │  │  sessions +              │  │
│  │              │  │          │  │  session_participants    │  │
│  └──────────────┘  └──────────┘  └──────────────────────────┘  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │  friendships +       │  │  roblox_friends_cache +      │    │
│  │  user_favorites_cache│  │  roblox_experience_cache     │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                       ▲
                       │
                  OAuth Flow
                       │
┌──────────────────────┴──────────────────────────────────────────┐
│                   Roblox OAuth 2.0 & APIs                       │
│   (Authorization, User Info, Presence, Friends, Favorites)      │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Authentication Flow

### Files Involved

**Frontend:**
- `src/features/auth/useAuth.tsx` - Auth context provider
- `src/lib/api.ts` - HTTP client with token refresh
- `src/lib/tokenStorage.ts` - Secure token storage
- `src/lib/pkce.ts` - PKCE code generation
- `app/auth/sign-in.tsx` - Sign-in screen
- `app/auth/roblox.tsx` - OAuth callback handler

**Backend:**
- `backend/src/routes/auth.ts` - Auth endpoints
- `backend/src/services/robloxOAuth.ts` - OAuth client
- `backend/src/services/tokenService.ts` - JWT generation/verification
- `backend/src/services/userService.ts` - User CRUD operations
- `backend/src/middleware/authenticate.ts` - JWT middleware

### Step-by-Step Flow

1. **Initiate OAuth** (`POST /auth/roblox/start`)
   - Client generates PKCE `code_verifier` (random 128-char string)
   - Client derives `code_challenge` = SHA256(code_verifier)
   - Client sends challenge to backend
   - Backend generates random `state` parameter (CSRF protection)
   - Backend returns Roblox authorization URL
   - Client stores `code_verifier` and `state` in AsyncStorage

2. **User Authorization**
   - Client opens WebBrowser to Roblox OAuth page
   - User authenticates with Roblox
   - Roblox redirects to `lagalaga://auth/roblox?code=...&state=...`

3. **Complete OAuth** (`POST /auth/roblox/callback`)
   - Client retrieves `code_verifier` and `state` from AsyncStorage
   - Client sends `code`, `state`, `code_verifier` to backend
   - Backend validates state parameter
   - Backend exchanges code for Roblox access token (with code_verifier)
   - Backend fetches user info from Roblox API
   - Backend upserts user to `app_users` table
   - Backend generates custom JWT tokens (access + refresh)
   - Backend returns tokens + user info to client

4. **Token Storage**
   - Client stores `accessToken` in SecureStore (native) / localStorage (web)
   - Client stores `refreshToken` in SecureStore (native) / localStorage (web)
   - Tokens are encrypted on iOS/Android via system keychain

5. **Authenticated Requests**
   - Client includes `Authorization: Bearer {accessToken}` header
   - Backend `authenticate` middleware validates JWT
   - On 401, client automatically attempts token refresh

6. **Token Refresh** (`POST /auth/refresh`)
   - Client sends `refreshToken` to backend
   - Backend validates refresh token signature
   - Backend generates new access + refresh tokens
   - Client updates stored tokens

### Token Lifecycle
- **Access Token**: 15 minutes (configured in `backend/.env` as `JWT_EXPIRY`)
- **Refresh Token**: 7 days (configured as `REFRESH_TOKEN_EXPIRY`)

### Where Tokens Are Stored
- **iOS/Android**: expo-secure-store (encrypted keychain)
- **Web**: localStorage (plaintext, browser-dependent)
- **Keys**: `auth_access_token`, `auth_refresh_token`

### How Sessions Are Validated
- JWT middleware (`backend/src/middleware/authenticate.ts`) extracts token from header
- Verifies signature using `JWT_SECRET` environment variable
- Decodes payload to extract `userId`, `robloxUserId`, `robloxUsername`
- Attaches user context to `request.user` for downstream handlers
- Rejects invalid/expired tokens with 401 status

## 4. Authorization Model

### How Requests Are Authorized

**Backend-Mediated Authorization:**
- Backend acts as the authorization enforcement layer
- Application logic in route handlers and services determines permissions
- No direct client access to database removes client-side authorization risks

**JWT-Based Identity:**
- Every authenticated request carries user identity in JWT
- `request.user` object contains: `userId`, `robloxUserId`, `robloxUsername`
- Services use `userId` to enforce ownership (e.g., "only host can modify session")

**Example Authorization Checks:**
- Creating a session: User must be authenticated (checked by `authenticate` middleware)
- Joining a session: Check participant count < max_participants, user not already joined
- Invite-only sessions: Require valid invite code
- Future: Host-only operations (cancel session, kick participant)

### Supabase RLS Usage

**Status**: Enabled but largely bypassed.

- RLS is enabled on all tables: `app_users`, `games`, `sessions`, `session_participants`, `session_invites`
- Backend uses service-role client via `getSupabase()` which **bypasses RLS**
- User-scoped client available via `getUserScopedClient(accessToken)` but **not currently used**

**Rationale:**
- Backend is trusted intermediary
- Simpler permission logic in application code
- Frontend never accesses database directly
- RLS serves as defense-in-depth if credentials leak

**RLS Policies:**
- Documented in `supabase/migrations/002_enable_rls_policies.sql`
- Allows authenticated reads for public/owned sessions
- Allows authenticated writes for owned resources

### Where Service Role Keys Are Used

**Backend Only:**
- `backend/src/config/supabase.ts` initializes service-role client
- Environment variable: `SUPABASE_SERVICE_ROLE_KEY`
- **NEVER exposed to frontend**
- Used for all backend database operations

**Frontend:**
- Uses anon key for Supabase client (see `src/lib/supabase.ts`)
- But frontend Supabase client is **not used** for data operations
- Only present for potential future realtime subscriptions (unused currently)

## 5. Data Model

### Real Tables

#### app_users
```sql
id                   UUID PRIMARY KEY
roblox_user_id       VARCHAR UNIQUE
roblox_username      VARCHAR
roblox_display_name  VARCHAR
roblox_profile_url   TEXT
avatar_headshot_url  TEXT            -- Cached avatar
avatar_cached_at     TIMESTAMPTZ     -- Cache timestamp
status               TEXT            -- 'ACTIVE' | 'PENDING_DELETION' | 'DELETED'
token_version        INTEGER         -- JWT invalidation counter (default 0)
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
last_login_at        TIMESTAMPTZ
```

**Purpose**: User accounts linked to Roblox OAuth

#### games
```sql
place_id             BIGINT PRIMARY KEY  -- Roblox place ID
canonical_web_url    TEXT NOT NULL
canonical_start_url  TEXT NOT NULL
game_name            TEXT
game_description     TEXT
thumbnail_url        TEXT
max_players          INTEGER
creator_id           BIGINT
creator_name         TEXT
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: Roblox game/experience catalog

#### sessions
```sql
id                   UUID PRIMARY KEY
place_id             BIGINT (FK -> games.place_id)
host_id              UUID (FK -> app_users.id)
title                TEXT NOT NULL
description          TEXT
visibility           session_visibility  -- 'public' | 'friends' | 'invite_only'
status               session_status      -- 'scheduled' | 'active' | 'completed' | 'cancelled'
max_participants     INTEGER (default 10)
scheduled_start      TIMESTAMPTZ
scheduled_end        TIMESTAMPTZ
original_input_url   TEXT NOT NULL
normalized_from      TEXT NOT NULL
is_ranked            BOOLEAN (default false)
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: Gaming sessions

#### session_participants
```sql
session_id           UUID (FK -> sessions.id)
user_id              UUID (FK -> app_users.id)
role                 TEXT ('host', 'member')
state                TEXT ('invited', 'joined', 'left', 'kicked')
handoff_state        TEXT ('rsvp_joined', 'opened_roblox', 'confirmed_in_game', 'stuck')
joined_at            TIMESTAMPTZ
left_at              TIMESTAMPTZ
PRIMARY KEY (session_id, user_id)
```

**Purpose**: Many-to-many relationship between sessions and users with presence tracking
**Migration**: `supabase/migrations/002_create_sessions_games_v1_v2.sql`, `20260214135005_handoff_presence.sql`

#### session_invites
```sql
id                   UUID PRIMARY KEY
session_id           UUID (FK -> sessions.id)
created_by           UUID (FK -> app_users.id)
invite_code          TEXT UNIQUE
max_uses             INTEGER
uses_count           INTEGER DEFAULT 0
expires_at           TIMESTAMPTZ
created_at           TIMESTAMPTZ
```

**Purpose**: Shareable invite codes for private sessions
**Migration**: `supabase/migrations/002_create_sessions_games_v1_v2.sql`

#### friendships
```sql
id                   UUID PRIMARY KEY
user_id              UUID (FK -> app_users.id)
friend_id            UUID (FK -> app_users.id)
status               TEXT ('pending', 'accepted', 'blocked')
initiated_by         UUID (FK -> app_users.id)
created_at           TIMESTAMPTZ
accepted_at          TIMESTAMPTZ
updated_at           TIMESTAMPTZ
CONSTRAINT chk_friendships_canonical_order CHECK (user_id < friend_id)
UNIQUE (user_id, friend_id)
```

**Purpose**: Native LagaLaga friendships with canonical ordering
**Migration**: `supabase/migrations/20260214110000_hybrid_friends_schema.sql`

#### roblox_friends_cache
```sql
user_id              UUID PRIMARY KEY (FK -> app_users.id)
roblox_user_id       BIGINT
friends_json         JSONB DEFAULT '[]'  -- Full friends array blob
etag                 TEXT
fetched_at           TIMESTAMPTZ
expires_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: Per-user blob cache of Roblox friends list (single row per user)
**Note**: `roblox_friends_cache_legacy` (row-per-friend) is superseded by this table

#### roblox_friends_cache_legacy
Row-per-friend legacy cache. Superseded by `roblox_friends_cache`.

#### user_favorites_cache
```sql
user_id              UUID PRIMARY KEY
favorites_json       JSONB DEFAULT '[]'
etag                 TEXT
cached_at            TIMESTAMPTZ
expires_at           TIMESTAMPTZ
```

**Purpose**: Cached user favorite Roblox experiences (blob per user)

#### roblox_experience_cache
```sql
id                   BIGSERIAL PRIMARY KEY
platform_key         TEXT DEFAULT 'roblox'
url                  TEXT UNIQUE
place_id             TEXT
universe_id          TEXT
name                 TEXT
updated_at           TIMESTAMPTZ
created_at           TIMESTAMPTZ
```

**Purpose**: Cache for resolved Roblox game metadata from URLs

#### session_invited_roblox
```sql
session_id           UUID (FK -> sessions.id)
roblox_user_id       BIGINT
created_at           TIMESTAMPTZ
PRIMARY KEY (session_id, roblox_user_id)
```

**Purpose**: Roblox users explicitly invited to a session before they have app accounts

#### user_push_tokens
```sql
id                   UUID PRIMARY KEY
user_id              UUID (FK -> app_users.id)
expo_push_token      TEXT UNIQUE with user_id
device_id            TEXT
platform             TEXT  -- 'ios' | 'android' | 'web'
created_at           TIMESTAMPTZ
last_seen_at         TIMESTAMPTZ
```

**Purpose**: Expo push notification tokens

#### user_stats
```sql
user_id              UUID PRIMARY KEY (FK -> app_users.id)
sessions_hosted      INTEGER DEFAULT 0
sessions_joined      INTEGER DEFAULT 0
streak_days          INTEGER DEFAULT 0
last_active_date     DATE
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: Aggregate user activity statistics

#### user_achievements
```sql
id                   UUID PRIMARY KEY
user_id              UUID (FK -> app_users.id)
code                 TEXT
unlocked_at          TIMESTAMPTZ
UNIQUE (user_id, code)
```

**Purpose**: Achievements unlocked by users

#### user_rankings
```sql
user_id              UUID PRIMARY KEY (FK -> app_users.id)
rating               INTEGER DEFAULT 1000  -- ELO-style
wins                 INTEGER DEFAULT 0
losses               INTEGER DEFAULT 0
last_ranked_match_at TIMESTAMPTZ
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: Current competitive ratings

#### match_results
```sql
id                   UUID PRIMARY KEY
session_id           UUID UNIQUE (FK -> sessions.id)
winner_id            UUID (FK -> app_users.id)
rating_delta         INTEGER
created_at           TIMESTAMPTZ
```

**Purpose**: Results for ranked matches

#### seasons
```sql
id                   UUID PRIMARY KEY
season_number        INTEGER UNIQUE
start_date           TIMESTAMPTZ
end_date             TIMESTAMPTZ
is_active            BOOLEAN DEFAULT false
created_at           TIMESTAMPTZ
```

**Purpose**: Competitive seasons

#### season_rankings
```sql
id                   UUID PRIMARY KEY
season_id            UUID (FK -> seasons.id)
user_id              UUID (FK -> app_users.id)
final_rating         INTEGER
created_at           TIMESTAMPTZ
UNIQUE (season_id, user_id)
```

**Purpose**: Historical end-of-season rankings

#### account_deletion_requests
```sql
id                   UUID PRIMARY KEY
user_id              UUID (FK -> app_users.id)
status               TEXT  -- 'PENDING' | 'COMPLETED' | 'CANCELED' | 'FAILED'
initiator            TEXT  -- 'IN_APP' | 'WEB'
reason               TEXT
requested_at         TIMESTAMPTZ
scheduled_purge_at   TIMESTAMPTZ
completed_at         TIMESTAMPTZ
canceled_at          TIMESTAMPTZ
failed_at            TIMESTAMPTZ
failure_reason       TEXT
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
UNIQUE (user_id) WHERE status = 'PENDING'  -- one pending request per user
```

**Purpose**: Lifecycle tracking for GDPR/user-initiated account deletion

#### reports
```sql
id                   UUID PRIMARY KEY
reporter_id          UUID (FK -> app_users.id)
category             report_category  -- enum: CSAM | GROOMING_OR_SEXUAL_EXPLOITATION | HARASSMENT_OR_ABUSIVE_BEHAVIOR | IMPERSONATION | OTHER
target_type          TEXT             -- 'USER' | 'SESSION' | 'GENERAL'
target_user_id       UUID (FK -> app_users.id, nullable)
target_session_id    UUID (FK -> sessions.id, nullable)
details              TEXT
status               report_status    -- enum: OPEN | UNDER_REVIEW | CLOSED | ESCALATED
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: User safety reports. CSAM reports are auto-escalated to `ESCALATED` status.
**Migration**: `supabase/migrations/20260220154000_create_reports_and_safety_rls.sql`

### Relationships

- `app_users` 1 → N `sessions` (via `host_id`)
- `games` 1 → N `sessions` (via `place_id`)
- `sessions` N ↔ N `app_users` (via `session_participants`)
- `sessions` 1 → N `session_invites`
- `sessions` 1 → N `session_invited_roblox`
- `sessions` 1 → 1 `match_results` (ranked sessions only)
- `app_users` N ↔ N `app_users` (via `friendships`)
- `app_users` 1 → 1 `roblox_friends_cache`
- `app_users` 1 → 1 `user_stats`
- `app_users` 1 → N `user_achievements`
- `app_users` 1 → 1 `user_rankings`
- `seasons` 1 → N `season_rankings`

### Schema Documentation
Reference: `docs/canonical/database_schema.md` and `database-schema.md` (live Supabase state)

## 6. Sessions Domain

### File Structure

**Frontend:**
- `src/features/sessions/types-v2.ts` - TypeScript types
- `src/features/sessions/apiStore-v2.ts` - API client (current)
- `src/features/sessions/apiStore.ts` - Legacy v1 API client
- `src/features/sessions/mock.ts` - Mock data store
- `src/features/sessions/store.ts` - Store selector (mock vs API)
- `src/features/sessions/index.ts` - Public exports

**Routes:**
- `app/sessions/index-v2.tsx` - List active sessions
- `app/sessions/create-v2.tsx` - Create new session
- `app/sessions/[id]-v2.tsx` - Session details
- `app/invite/[code].tsx` - Join via invite code

### Store Pattern

The sessions feature uses a **strategy pattern** to switch between mock and backend data:

```typescript
// src/features/sessions/store.ts
const USE_BACKEND = isSupabaseConfigured() && API_URL !== '';

export const sessionsStore = USE_BACKEND
  ? sessionsAPIStoreV2  // Real backend
  : mockSessionsStore;  // Local mock data
```

**Mock Store** (`src/features/sessions/mock.ts`):
- In-memory array of hardcoded sessions
- Used when backend is not configured
- Simulates CRUD operations

**API Store** (`src/features/sessions/apiStore-v2.ts`):
- HTTP client wrapping `/api/sessions` endpoints
- Methods: `createSession()`, `listSessions()`, `getSessionById()`, `joinSession()`, `getSessionByInviteCode()`, `listMyPlannedSessions()`
- Includes correlation IDs for request tracing

### Active vs Planned Sessions

**Active Sessions**:
- Displayed on main sessions list (`app/sessions/index-v2.tsx`)
- Fetched via `listSessions({ status: 'active' })`
- Endpoint: `GET /api/sessions?status=active`
- Shows all public sessions or sessions user has joined

**Planned Sessions**:
- Shown in user's profile or dashboard (future feature)
- Fetched via `listMyPlannedSessions({ limit: 20 })`
- Endpoint: `GET /api/user/sessions`
- Backend filters to sessions where user is host or participant
- Implementation: `backend/src/services/sessionService-v2.ts:listUserPlannedSessions()`

## 7. Friends System

### Hybrid Friends Architecture

LagaLaga implements a **hybrid friends system** that combines native app friendships with Roblox social graph data.

**Native LagaLaga Friendships**:
- Stored in `friendships` table with canonical ordering (`user_id < friend_id`)
- Statuses: `pending`, `accepted`, `blocked`
- Enables friend-only session visibility
- Used for friend filtering and notifications

**Roblox Friends Cache**:
- Stored in `roblox_friends_cache` table
- Periodically synced from Roblox API
- Used for friend suggestions and discovery
- Enables "invite Roblox friends" feature

**Friend Discovery Flow**:
1. User syncs Roblox friends via `POST /api/me/roblox/sync-friends`
2. Backend fetches friends list from Roblox API using stored OAuth tokens
3. Cache is updated with Roblox friend data
4. Frontend displays Roblox friends who aren't yet LagaLaga friends as suggestions
5. User can send friend requests to suggestions

**Friend-Only Sessions**:
- Sessions with `visibility='friends'` are filtered by friendship status
- Database function `list_sessions_optimized()` enforces friend filtering
- Only accepted friendships grant access to friend-only sessions

### Presence Tracking

**Handoff State Tracking**:
Session participants have a `handoff_state` field tracking their journey from RSVP to in-game:
- `rsvp_joined` - User joined session in app
- `opened_roblox` - User tapped "Join Game" deep link
- `confirmed_in_game` - User presence confirmed in Roblox
- `stuck` - User encountered issues joining

**Roblox Presence API**:
- `GET /api/presence/roblox/users` - Check if users are online/in-game
- Uses stored Roblox OAuth tokens to query presence
- Updates `handoff_state` when users are confirmed in game
- Enables "who's playing now" indicators

## 8. Push Notifications

**Registration**:
- Mobile clients register push tokens via `POST /api/me/register-push-token`
- Tokens stored in database (implementation varies by push provider)
- Associated with user for targeted notifications

**Use Cases**:
- Session start reminders
- Friend request notifications
- Session invitations
- Friend joined session alerts

## 9. Favorites & Caching

### User Favorites Cache

**Table**: `user_favorites_cache`
- Caches user's favorite Roblox experiences
- Reduces API calls to Roblox
- Pre-populates game selection UI

**Endpoint**: `GET /api/me/roblox/favorites`
- Returns user's favorite games
- Supports pagination with cursor
- TTL: Refreshed on request if stale

### Roblox Experience Cache

**Table**: `roblox_experience_cache`
- Caches game metadata resolved from URLs
- Maps pasted URLs to place IDs and game info
- TTL: 24 hours (enforced in backend)

## 10. API Layer

### Frontend API Client

**Primary File**: `src/lib/api.ts`

**Key Features:**
- Singleton `ApiClient` class
- Automatic token attachment from `tokenStorage`
- Automatic token refresh on 401 responses
- Retry logic for 5xx errors (exponential backoff, max 2 retries)
- Correlation ID generation (`X-Correlation-ID` header)
- Request ID tracking from backend (`X-Request-ID` header)
- Monitoring integration (tracks HTTP request metrics)

**Header Attachment:**
```typescript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`,  // From tokenStorage
  'X-Correlation-ID': correlationId,         // Generated client-side
};
```

**Error Handling Pattern:**
- Network errors → `NetworkError` (extends Error)
- API errors → `ApiError` (with code, message, statusCode, requestId)
- Parsing: `parseApiError(response)` reads standardized error format from backend
- Integration with frontend logger and monitoring

**API Methods:**
```typescript
apiClient.auth.startRobloxAuth(codeChallenge)
apiClient.auth.completeRobloxAuth(code, state, codeVerifier)
apiClient.auth.refresh()
apiClient.auth.revoke()
apiClient.auth.me()

apiClient.sessions.list({ limit, offset })
apiClient.sessions.create(input)
apiClient.sessions.getById(id)
apiClient.sessions.join(id)
apiClient.sessions.leave(id)
```

### Safety Reporting System

**Implemented**: 2026-02-20

**Purpose**: Allow users to report safety issues (CSAM, grooming, harassment, impersonation, other) against users, sessions, or the general platform.

**Frontend flow** (`app/safety-report.tsx`):
1. Step 1 – Pick category (CSAM, GROOMING_OR_SEXUAL_EXPLOITATION, etc.)
2. Step 2 – Describe the target and add report details
3. Step 3 – Confirmation screen with ticket ID (report UUID)

Supports URL params `targetType`, `targetUserId`, `targetSessionId` for pre-filling context. Entry points:
- `app/me.tsx` – "Safety & Report" button (no pre-fill)
- `app/profile.tsx` – "Safety & Report" overflow action (no pre-fill)
- `app/sessions/[id]-v2.tsx` – Pre-fills `targetType=SESSION` and `targetSessionId`

**Backend service** (`backend/src/services/reporting.service.ts`):
- Validates target existence (looks up `app_users` / `sessions`)
- Rate limit: 5 reports per hour per user
- Duplicate window: 5-minute dedup check
- CSAM reports auto-set to `ESCALATED` status
- Structured safety event logging for CSAM

**Database** (`supabase/migrations/20260220154000_create_reports_and_safety_rls.sql`):
- See `reports` table in Database Schema doc

**API client** (`src/lib/api.ts`):
```typescript
apiClient.reports.create({
  category: 'CSAM' | 'GROOMING_OR_SEXUAL_EXPLOITATION' | 'HARASSMENT_OR_ABUSIVE_BEHAVIOR' | 'IMPERSONATION' | 'OTHER',
  targetType: 'USER' | 'SESSION' | 'GENERAL',
  targetUserId?: string,
  targetSessionId?: string,
  details?: string,
})
```

### Runtime Configuration

**File**: `src/lib/runtimeConfig.ts`

- `API_URL`: Backend URL from `EXPO_PUBLIC_API_URL` env var — falls back to localhost for development
- `ENABLE_COMPETITIVE_DEPTH`: Feature flag for ranked sessions, leaderboard, match history (`EXPO_PUBLIC_ENABLE_COMPETITIVE_DEPTH`)
- `DELETE_ACCOUNT_WEB_URL`: URL for web-based account deletion (`EXPO_PUBLIC_DELETE_ACCOUNT_WEB_URL`)
- `CHILD_SAFETY_POLICY_URL`: URL for child safety policy (`EXPO_PUBLIC_CHILD_SAFETY_POLICY_URL`; defaults to `https://ilpeppino.github.io/lagalaga/child-safety.html`)
- Used by all API clients and safety-related screens

## 8. Backend API Structure

### Server Initialization

**File**: `backend/src/server.ts`

**Plugins Registered:**
1. `fastifyEnv` - Environment variable validation
2. `requestLoggingPlugin` - Request/response logging
3. `corsPlugin` - CORS headers
4. `authPlugin` - JWT configuration (unused, JWT handled manually)
5. `errorHandlerPlugin` - Global error handler
6. `healthCheckPlugin` - `/health` and `/health/detailed` endpoints
7. `metricsPlugin` - `/metrics` (Prometheus) and `/metrics/json`

**Route Registration (in order):**
```typescript
fastify.register(authRoutes, { prefix: '/auth' })
fastify.register(robloxConnectRoutes, { prefix: '/api/auth' })
fastify.register(sessionsRoutes)      // Legacy v1
fastify.register(sessionsRoutesV2)    // Current v2
fastify.register(robloxRoutes)
fastify.register(meRoutes, { prefix: '/api/me' })
fastify.register(presenceRoutes)
fastify.register(friendsRoutes)
fastify.register(leaderboardRoutes)
fastify.register(accountRoutes, { prefix: '/v1/account' })
fastify.register(reportsRoutes)
```

**Background Timers (started at boot if features enabled):**
- Season rollover check (hourly) when `isCompetitiveDepthEnabled()`
- Account deletion purge cycle (interval set by `ACCOUNT_PURGE_INTERVAL_MINUTES`) when `ACCOUNT_PURGE_ENABLED`

### Real Endpoints Discovered

#### Auth Routes (`/auth/*`)
**File**: `backend/src/routes/auth.ts`

- `POST /auth/roblox/start` - Generate OAuth URL
- `POST /auth/roblox/callback` - Exchange code for JWT
- `POST /auth/refresh` - Refresh access token
- `POST /auth/revoke` - Sign out (revoke token)
- `GET /auth/me` - Get current user with avatar

#### Sessions v2 Routes (`/api/sessions`)
**File**: `backend/src/routes/sessions-v2.ts`

- `POST /api/sessions` - Create session; supports `template=quick` and `is_ranked` flag (authenticated)
- `GET /api/sessions` - List sessions (public, with filters)
- `GET /api/user/sessions` - List user's planned sessions (authenticated)
- `GET /api/sessions/:id` - Get session details (public)
- `GET /api/sessions/:id/invite-details` - Get invite details for a session (authenticated)
- `GET /api/sessions/:id/summary` - Get session summary / result (authenticated)
- `POST /api/sessions/:id/result` - Submit match result for ranked session (authenticated)
- `POST /api/sessions/:id/join` - Join session (authenticated)
- `POST /api/sessions/:id/decline-invite` - Decline a session invitation (authenticated)
- `POST /api/sessions/:id/handoff/opened` - Signal participant has opened Roblox (authenticated)
- `POST /api/sessions/:id/handoff/confirmed` - Signal participant is confirmed in-game (authenticated)
- `POST /api/sessions/:id/handoff/stuck` - Signal participant is stuck joining (authenticated)
- `DELETE /api/sessions/:id` - Delete session (host only, authenticated)
- `POST /api/sessions/bulk-delete` - Bulk delete sessions (authenticated)
- `GET /api/invites/:code` - Get session by invite code (public)

#### Sessions v1 Routes (Legacy)
**File**: `backend/src/routes/sessions.ts`

- `GET /sessions` - List sessions
- `POST /sessions` - Create session
- `GET /sessions/:id` - Get session
- `POST /sessions/:id/join` - Join session
- `POST /sessions/:id/leave` - Leave session

#### Friends Routes
**File**: `backend/src/routes/friends.routes.ts`

Feature-flagged by `FEATURE_FRIENDS_ENABLED` environment variable.

- `GET /api/user/friends` - List friends (authenticated, sections: all/lagalaga/requests/roblox_suggestions)
- `POST /api/user/friends/refresh` - Refresh Roblox friends cache (authenticated)
- `POST /api/friends/request` - Send friend request (authenticated)
- `POST /api/friends/accept` - Accept friend request (authenticated)
- `POST /api/friends/reject` - Reject friend request (authenticated)
- `DELETE /api/friends/:friendshipId` - Remove friendship (authenticated)

#### Presence Routes
**File**: `backend/src/routes/presence.routes.ts`

- `POST /api/roblox/presence` - Get Roblox presence for up to 50 users by robloxUserIds (authenticated)
- `GET /api/presence/roblox/users` - Get presence by comma-separated userIds query param (authenticated)

#### Me Routes (`/api/me`)
**File**: `backend/src/routes/me.routes.ts`

- `GET /api/me` - Get current user profile with Roblox connection status (authenticated)
- `GET /api/me/stats` - Get user stats and achievements (authenticated)
- `GET /api/me/match-history` - Get user match history (authenticated, feature-flagged by `ENABLE_COMPETITIVE_DEPTH`)
- `GET /api/me/roblox/favorites` - Get user's Roblox favorites (authenticated, paginated)
- `GET /api/me/roblox/friends` - Get Roblox friends from cache (authenticated)
- `POST /api/me/roblox/friends/refresh` - Force refresh Roblox friends cache (authenticated)
- `GET /api/me/favorite-experiences` - Get favorite experiences with ETag/304 support (authenticated)
- `POST /api/me/push-tokens` - Register Expo push notification token (authenticated)
- `DELETE /api/me/push-tokens` - Remove push notification token (authenticated)

#### Roblox Connect Routes (`/api/auth`)
**File**: `backend/src/routes/roblox-connect.routes.ts`

- `GET /api/auth/roblox/start` - Start Roblox OAuth flow for token refresh (authenticated)
- `POST /api/auth/roblox/callback` - Complete Roblox OAuth token exchange (authenticated)

#### Leaderboard Routes
**File**: `backend/src/routes/leaderboard.routes.ts`

- `GET /api/leaderboard` - Get leaderboard (query: `type=weekly|all_time`); feature-flagged by `competitive_depth`

#### Account Routes (`/v1/account`)
**File**: `backend/src/routes/account.routes.ts`

- `POST /v1/account/deletion-request` - Request account deletion (authenticated)
- `GET /v1/account/deletion-status` - Get deletion request status (authenticated)
- `POST /v1/account/deletion-cancel` - Cancel pending deletion request (authenticated)

#### Roblox Routes
**File**: `backend/src/routes/roblox.ts`

- `POST /roblox/normalize-link` - Normalize a Roblox game URL
- `POST /roblox/resolve-experience` - Resolve a Roblox experience from URL
- `GET /api/roblox/experience-by-place/:placeId` - Get experience metadata by Roblox place ID

#### Reports Routes (`/api/reports`)
**File**: `backend/src/routes/reports.routes.ts`

- `POST /api/reports` - Create a safety report (authenticated)
  - Categories: `CSAM`, `GROOMING_OR_SEXUAL_EXPLOITATION`, `HARASSMENT_OR_ABUSIVE_BEHAVIOR`, `IMPERSONATION`, `OTHER`
  - Target types: `USER`, `SESSION`, `GENERAL`
  - Rate limited: 5 reports/hour per user
  - Duplicate window: 5 minutes
  - CSAM reports auto-escalated and triggers notification stub

#### Health & Metrics
**Files**: `backend/src/plugins/healthCheck.ts`, `backend/src/plugins/metrics.ts`

- `GET /health` - Simple health check
- `GET /health/detailed` - Database connection status
- `GET /metrics` - Prometheus metrics
- `GET /metrics/json` - JSON metrics

## 9. Caching Strategy

### Avatar Caching

**Implementation**: `backend/src/services/userService.ts:getAvatarHeadshotUrl()`

**Purpose**: Reduce calls to Roblox thumbnail API

**Logic:**
1. Check if `avatar_headshot_url` and `avatar_cached_at` exist in `app_users` table
2. If cache exists and age < TTL (6 hours), return cached URL
3. Otherwise, fetch fresh avatar from Roblox API
4. Update `avatar_headshot_url` and `avatar_cached_at` in database
5. Return avatar URL

**TTL**: 6 hours (hardcoded in `userService.ts`)

**Storage**: Database columns on `app_users` table
- `avatar_headshot_url`: TEXT
- `avatar_cached_at`: TIMESTAMPTZ

**Migration**: `backend/migrations/add_avatar_cache_to_app_users.sql`

**API Usage**: Called by `GET /auth/me` endpoint to include avatar in user response

### Other Caching
Not present in current codebase.

## 10. Navigation Architecture

### Expo Router Layout Structure

**Root Layout**: `app/_layout.tsx`
- Wraps entire app with `AuthProvider` and `ErrorBoundary`
- Loads custom fonts (BitcountSingle-Regular, BitcountSingle-Bold)
- Configures theme (light/dark mode)
- Registers deep link listener

**Routes Registered:**
```typescript
<Stack>
  <Stack.Screen name="index" />           // Landing page
  <Stack.Screen name="auth" />            // Auth group
  <Stack.Screen name="sessions" />        // Sessions group
  <Stack.Screen name="(tabs)" />          // Tab navigator
  <Stack.Screen name="modal" />           // Example modal
</Stack>
```

### Route Groups

**`app/(tabs)/`** - Tab navigator (3 tabs)
- `_layout.tsx` - Tab bar configuration; all tabs have a user icon button (top-right → `/me`)
- `index.tsx` - Home tab (sessions list)
- `friends.tsx` - Friends tab
- `explore.tsx` - Explore tab

**`app/auth/`** - Authentication
- `_layout.tsx` - Auth stack layout
- `sign-in.tsx` - Sign-in screen
- `roblox.tsx` - OAuth callback handler

**`app/sessions/`** - Session management
- `_layout.tsx` - Sessions stack layout
- `index-v2.tsx` - Active sessions list (current)
- `create-v2.tsx` - Create session form (current)
- `[id]-v2.tsx` - Session details (current; has "Safety & Report" action pre-filled with SESSION target)
- `handoff.tsx` - Handoff / launch Roblox flow (in-game presence tracking)
- Legacy files: `index.tsx`, `create.tsx`, `[id].tsx` (v1)

**`app/invite/`** - Invite handling (custom deep link)
- `_layout.tsx` - Invite stack layout
- `[code].tsx` - Join via invite code (dynamic route)

**`app/invites/`** - Session invite view (distinct from deep-link invite)
- `_layout.tsx` - Invites stack layout
- `[sessionId].tsx` - Session invite view for a specific session

**`app/account/`** - Account management
- `delete.tsx` - Initiate account deletion
- `delete-confirm.tsx` - Confirm deletion
- `delete-done.tsx` - Deletion requested confirmation

**`app/leaderboard/`** - Competitive leaderboard
- `index.tsx` - Leaderboard screen (feature-flagged by `ENABLE_COMPETITIVE_DEPTH`)

**Root-level screens:**
- `app/me.tsx` - User profile (has "Safety & Report" button → `/safety-report`)
- `app/profile.tsx` - User stats and achievements (has "Safety & Report" overflow action)
- `app/safety-report.tsx` - 3-step safety reporting flow (category → target/details → confirmation)
- `app/match-history.tsx` - Match history (feature-flagged by `ENABLE_COMPETITIVE_DEPTH`)

### Navigation Patterns

**File-Based Routing**: Expo Router maps file paths to routes automatically
- `app/sessions/[id]-v2.tsx` → `/sessions/{id}-v2`
- `app/invite/[code].tsx` → `/invite/{code}`

**Deep Linking**:
- Scheme: `lagalaga://` (production) or `exp+lagalaga://` (development)
- OAuth redirect: `lagalaga://auth/roblox`
- Invite links: `lagalaga://invite/{code}`

**Programmatic Navigation**:
```typescript
import { router } from 'expo-router';
router.push('/sessions/123-v2');
router.replace('/auth/sign-in');
router.back();
```

## 11. Environment Variables

### Frontend (.env)

```bash
# Backend API
EXPO_PUBLIC_API_URL=http://localhost:3001

# Roblox OAuth (client-side, not actually used - backend handles OAuth)
EXPO_PUBLIC_ROBLOX_CLIENT_ID=your-client-id
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
```

**File**: `.env.example`
**Access**: Via `process.env.EXPO_PUBLIC_API_URL` or `Constants.expoConfig.extra`

### Backend (backend/.env)

```bash
# Server
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=debug

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # NEVER expose to client
SUPABASE_ANON_KEY=your-anon-key                  # Optional, for RLS operations

# Roblox OAuth
ROBLOX_CLIENT_ID=your-client-id
ROBLOX_CLIENT_SECRET=your-client-secret
ROBLOX_REDIRECT_URI=lagalaga://auth/roblox

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=different-secret-for-refresh
REFRESH_TOKEN_EXPIRY=7d

# CORS
CORS_ORIGIN=*
```

**File**: `backend/.env.example`
**Validation**: `backend/src/config/env.ts` (using @fastify/env)

## 12. Error Handling Framework

### Implementation Date
2026-02-08

### Shared Error Codes
**File**: `shared/errors/codes.ts`

Standardized error codes shared between frontend and backend:
- `AUTH_*` - Authentication errors
- `SESSION_*` - Session-related errors
- `NOT_FOUND_*` - Resource not found
- `VALIDATION_*` - Input validation
- `INT_*` - Internal errors

### Backend Error Handling

**Files:**
- `backend/src/utils/errors.ts` - AppError class hierarchy
- `backend/src/plugins/errorHandler.ts` - Global error handler
- `backend/src/lib/sanitizer.ts` - PII sanitization
- `backend/src/lib/errorRecovery.ts` - Circuit breaker, retry logic
- `backend/src/lib/monitoring.ts` - Error tracking

**Error Classes:**
- `AppError` (base) - includes severity, statusCode, code
- `NotFoundError` - 404 errors
- `ValidationError` - 400 validation errors
- `AuthError` - 401/403 errors
- `SessionError` - Session-specific errors

**Global Handler:**
- Catches all unhandled errors
- Sanitizes PII before logging
- Returns standardized JSON response:
  ```json
  {
    "error": {
      "code": "SESSION_003",
      "message": "User-friendly message",
      "requestId": "uuid",
      "severity": "medium"
    }
  }
  ```

### Frontend Error Handling

**Files:**
- `src/lib/errors.ts` - ApiError, NetworkError classes
- `src/lib/errorPresenter.ts` - User-facing error messages
- `src/lib/logger.ts` - Client-side logger with RingBuffer
- `components/ErrorBoundary.tsx` - React error boundary
- `components/ErrorFallback.tsx` - Error UI
- `hooks/useErrorHandler.ts` - Error presentation hook

**Error Classes:**
- `ApiError` - Server errors (with code, message, statusCode, requestId)
- `NetworkError` - Network failures

**Usage Pattern:**
```typescript
const { handleError } = useErrorHandler();

try {
  await apiClient.sessions.join(sessionId);
} catch (error) {
  handleError(error);  // Shows user-friendly alert
}
```

**Error Boundary:**
- Catches React render errors
- Shows fallback UI
- Logs to monitoring

### Correlation IDs

**Client → Server:**
- Client generates `X-Correlation-ID` (UUID)
- Sent with every API request
- Allows tracing requests across frontend/backend logs

**Server → Client:**
- Server returns `X-Request-ID` (UUID)
- Included in error responses
- Enables support team to find exact request in logs

## 13. Logging & Monitoring

### Backend Logging

**File**: `backend/src/lib/logger.ts`

- Uses Fastify's built-in Pino logger
- Development: pretty-printed with timestamps
- Production: structured JSON
- Log level configurable via `LOG_LEVEL` env var

**File**: `backend/src/middleware/logging.middleware.ts`

- Logs every request/response
- Includes: method, URL, status, response time, user ID
- Sanitizes sensitive data

### Frontend Logging

**File**: `src/lib/logger.ts`

- Singleton logger with RingBuffer (stores last 100 logs in memory)
- Methods: `debug()`, `info()`, `warn()`, `error()`
- Integrates with monitoring system
- Logs persisted to `AsyncStorage` (future enhancement)

### Monitoring

**Files:**
- `backend/src/lib/monitoring.ts` - Backend metrics
- `src/lib/monitoring.ts` - Frontend metrics

**Capabilities:**
- HTTP request tracking (method, endpoint, status)
- Error capture with context
- Custom event tracking
- Performance metrics

**Documentation**: `docs/monitoring.md`, `docs/logging.md`

## 17. Future Extension Points

Based on the current architecture, the following extensions are feasible:

### 1. Real-Time Updates
- Add Supabase Realtime subscriptions for live session updates
- Frontend already has Supabase client initialized (`src/lib/supabase.ts`)
- Subscribe to `sessions` and `session_participants` tables
- Update UI when participants join/leave in real-time

### 2. User-Scoped Database Operations
- Backend already supports `getUserScopedClient(accessToken)`
- Could migrate certain read operations to enforce RLS
- Would require passing user JWT to Supabase instead of service-role

### 3. ✅ Push Notifications (Implemented)
- Push token registration via `POST /api/me/register-push-token`
- Database support for storing tokens
- Ready for session reminders and friend notifications

### 4. In-App Messaging
- Add `session_messages` table
- WebSocket or Supabase Realtime for live chat
- Useful for session coordination

### 5. ✅ Friend System (Implemented)
- Hybrid friends: native LagaLaga + Roblox social graph
- Friend-only session visibility enforced
- Friend requests and suggestions
- Roblox friends cache for discovery

### 6. ✅ Presence Tracking (Implemented)
- Handoff state tracking from RSVP to in-game
- Roblox Presence API integration
- "Who's playing now" indicators

### 7. ✅ Session History, Statistics & Rankings (Implemented)
- `user_stats`: sessions_hosted, sessions_joined, streak_days
- `user_achievements`: achievement codes per user
- `user_rankings`: ELO-style ratings, wins, losses
- `match_results`: result per ranked session
- `seasons` + `season_rankings`: competitive season history
- `GET /api/leaderboard`: leaderboard endpoint (feature-flagged)

### 8. Advanced Authorization
- Role-based permissions (admin, moderator)
- Host-only operations (kick user, cancel session)
- More granular session permissions

### 9. Multi-Platform Game Support
- Currently Roblox-only via `place_id`
- Games table already has `platform_key` for other platforms
- Add Steam, Epic Games, etc.

### 9. ✅ Account Deletion (Implemented)
- `account_deletion_requests` table with full lifecycle (PENDING → COMPLETED/CANCELED/FAILED)
- Grace period before purge (configurable `ACCOUNT_DELETION_GRACE_DAYS`)
- Routes: `POST /v1/account/deletion-request`, `GET /v1/account/deletion-status`, `POST /v1/account/deletion-cancel`
- Sets `app_users.status = 'PENDING_DELETION'` during grace period

### 10. ✅ Safety Reporting (Implemented)
- `reports` table with category/status enums
- Backend service: rate limiting (5/hr), duplicate window (5 min), CSAM auto-escalation
- `POST /api/reports` endpoint (authenticated)
- Frontend 3-step flow: `/safety-report` screen
- Entry points from Me screen, Profile screen, and Session detail screen

### 11. Production Hardening
- Redis for session state (currently in-memory Map)
- Token blacklist for logout (currently mitigated by `token_version` on `app_users`)
- Rate limiting per user
- Database connection pooling

### 12. Observability
- Distributed tracing (OpenTelemetry)
- APM integration (Sentry, Datadog)
- Custom dashboards for session metrics

---

## Related Documentation

- **Database Schema**: `docs/runbook/db/supabase-schema.md`
- **OAuth Implementation**: `docs/runbook/auth/OAUTH_IMPLEMENTATION.md`
- **Error Handling**: `docs/error-handling.md`
- **Logging**: `docs/logging.md`
- **Monitoring**: `docs/monitoring.md`
- **Deployment**: `docs/deployment/DEPLOYMENT.md`
- **Testing Guides**: `docs/runbook/test/*`
