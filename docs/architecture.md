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
┌─────────────────────────────────────────────────────────────┐
│                     Mobile/Web App (Expo)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Auth      │  │   Sessions   │  │  Error Handling  │   │
│  │  Context    │  │   Stores     │  │  & Monitoring    │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│         │                 │                    │            │
│         └─────────────────┴────────────────────┘            │
│                          │                                  │
│                    HTTP (Bearer JWT)                        │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend API (Fastify/Node.js)                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │   Auth   │  │ Sessions │  │  Roblox   │  │  Health/  │  │
│  │  Routes  │  │  Routes  │  │  Service  │  │  Metrics  │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘  │
│         │            │              │                       │
│         └────────────┴──────────────┘                       │
│                      │                                      │
│            Service-Role Client                              │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Supabase PostgreSQL                       │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  app_users   │  │  games   │  │  sessions +          │  │
│  │              │  │          │  │  session_participants│  │
│  └──────────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                       ▲
                       │
                  OAuth Flow
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                   Roblox OAuth 2.0                          │
│            (Authorization & User Info Endpoints)            │
└─────────────────────────────────────────────────────────────┘
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
roblox_user_id       VARCHAR(255) UNIQUE
roblox_username      VARCHAR(100)
roblox_display_name  VARCHAR(100)
roblox_profile_url   TEXT
avatar_headshot_url  TEXT            -- Cached avatar
avatar_cached_at     TIMESTAMPTZ     -- Cache timestamp
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
last_login_at        TIMESTAMPTZ
```

**Purpose**: User accounts linked to Roblox OAuth
**Migration**: `backend/migrations/001_create_app_users.sql`, `add_avatar_cache_to_app_users.sql`

#### games
```sql
-- v1 fields (legacy)
id                   UUID PRIMARY KEY
platform_key         TEXT
name                 TEXT
url                  TEXT UNIQUE
genre                TEXT

-- v2 fields (current)
place_id             BIGINT UNIQUE
canonical_web_url    TEXT
canonical_start_url  TEXT
game_name            TEXT

created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: Game metadata supporting both v1 (UUID) and v2 (Roblox place_id) approaches
**Migration**: `backend/migrations/002_create_sessions_games_v1_v2.sql`

#### sessions
```sql
id                   UUID PRIMARY KEY

-- v1 fields (legacy)
host_user_id         UUID
game_id              UUID (FK -> games.id)
start_time_utc       TIMESTAMPTZ
duration_minutes     INTEGER
max_players          INTEGER
session_type         TEXT

-- Shared fields
title                TEXT NOT NULL
visibility           TEXT ('public', 'friends', 'invite_only')
status               TEXT ('active', 'completed', 'cancelled')

-- v2 fields (current)
place_id             BIGINT (FK -> games.place_id)
host_id              UUID (FK -> app_users.id)
description          TEXT
max_participants     INTEGER
scheduled_start      TIMESTAMPTZ
original_input_url   TEXT
normalized_from      TEXT

created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**Purpose**: Gaming sessions with hybrid v1/v2 schema
**Migration**: `backend/migrations/002_create_sessions_games_v1_v2.sql`

#### session_participants
```sql
session_id           UUID (FK -> sessions.id)
user_id              UUID (FK -> app_users.id)
role                 TEXT ('host', 'player')
state                TEXT ('invited', 'joined', 'left')
joined_at            TIMESTAMPTZ
PRIMARY KEY (session_id, user_id)
```

**Purpose**: Many-to-many relationship between sessions and users
**Migration**: `backend/migrations/002_create_sessions_games_v1_v2.sql`

#### session_invites
```sql
id                   UUID PRIMARY KEY
session_id           UUID (FK -> sessions.id)
created_by           UUID (FK -> app_users.id)
invite_code          TEXT UNIQUE
created_at           TIMESTAMPTZ
```

**Purpose**: Shareable invite codes for private sessions
**Migration**: `backend/migrations/002_create_sessions_games_v1_v2.sql`

### Relationships

- `app_users` 1 → N `sessions` (via `host_id`)
- `games` 1 → N `sessions` (via `place_id` or `game_id`)
- `sessions` N ↔ N `app_users` (via `session_participants`)
- `sessions` 1 → N `session_invites`

### Schema Documentation
Reference: `docs/runbook/db/supabase-schema.md`

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
- Endpoint: `GET /api/sessions/mine`
- Backend filters to sessions where user is host or participant
- Implementation: `backend/src/services/sessionService-v2.ts:listUserPlannedSessions()`

## 7. API Layer

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

### Runtime Configuration

**File**: `src/lib/runtimeConfig.ts`

- `API_URL`: Backend URL from `EXPO_PUBLIC_API_URL` env var
- Falls back to localhost for development
- Used by all API clients

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

**Route Registration:**
```typescript
fastify.register(authRoutes, { prefix: '/auth' })
fastify.register(sessionsRoutes)      // Legacy v1
fastify.register(sessionsRoutesV2)    // Current v2
fastify.register(robloxRoutes)
```

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

- `POST /api/sessions` - Create session (authenticated)
- `GET /api/sessions` - List sessions (public, with filters)
- `GET /api/sessions/mine` - List user's planned sessions (authenticated)
- `GET /api/sessions/:id` - Get session details (public)
- `POST /api/sessions/:id/join` - Join session (authenticated)
- `GET /api/invites/:code` - Get session by invite code (public)

#### Sessions v1 Routes (Legacy)
**File**: `backend/src/routes/sessions.ts`

- `GET /sessions` - List sessions
- `POST /sessions` - Create session
- `GET /sessions/:id` - Get session
- `POST /sessions/:id/join` - Join session
- `POST /sessions/:id/leave` - Leave session

#### Roblox Routes
**File**: `backend/src/routes/roblox.ts`

- URL normalization and metadata extraction (implementation details in service)

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

**`app/(tabs)/`** - Tab navigator
- `_layout.tsx` - Tab bar configuration
- `index.tsx` - Home tab
- `explore.tsx` - Explore tab

**`app/auth/`** - Authentication
- `_layout.tsx` - Auth stack layout
- `sign-in.tsx` - Sign-in screen
- `roblox.tsx` - OAuth callback handler

**`app/sessions/`** - Session management
- `_layout.tsx` - Sessions stack layout
- `index-v2.tsx` - Active sessions list
- `create-v2.tsx` - Create session form
- `[id]-v2.tsx` - Session details (dynamic route)
- Legacy files: `index.tsx`, `create.tsx`, `[id].tsx` (v1)

**`app/invite/`** - Invite handling
- `_layout.tsx` - Invite stack layout
- `[code].tsx` - Join via invite code (dynamic route)

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

## 14. Future Extension Points

Based on the current architecture, the following extensions are feasible:

### 1. Real-Time Updates
- Add Supabase Realtime subscriptions for live session updates
- Frontend already has Supabase client initialized (`src/lib/supabase.ts`)
- Subscribe to `sessions` and `session_participants` tables
- Update UI when participants join/leave

### 2. User-Scoped Database Operations
- Backend already supports `getUserScopedClient(accessToken)`
- Could migrate certain read operations to enforce RLS
- Would require passing user JWT to Supabase instead of service-role

### 3. Push Notifications
- Notify users when session is about to start
- Notify when friends join a session
- Expo provides push notification APIs

### 4. In-App Messaging
- Add `session_messages` table
- WebSocket or Supabase Realtime for live chat
- Useful for session coordination

### 5. Friend System
- Add `friendships` table
- Filter sessions by "friends only" visibility
- Friend invites and requests

### 6. Session History & Statistics
- Archive completed sessions
- Track user stats (sessions hosted, attended, hours played)
- Leaderboards

### 7. Advanced Authorization
- Role-based permissions (admin, moderator)
- Host-only operations (kick user, cancel session)
- Invite-only session management

### 8. Multi-Platform Game Support
- Currently Roblox-only via `place_id`
- Games table already has `platform_key` for other platforms
- Add Steam, Epic Games, etc.

### 9. Production Hardening
- Redis for session state (currently in-memory Map)
- Token blacklist for logout
- Rate limiting per user
- Database connection pooling

### 10. Observability
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
