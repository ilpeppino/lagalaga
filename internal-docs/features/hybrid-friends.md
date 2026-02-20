# Hybrid Friends System — Implementation Plan

**Date:** 2026-02-14
**Status:** Draft
**Author:** Claude (planning agent)

---

## A. Goals & Non-Goals

### Goals

1. **Roblox friends cache** — Snapshot a user's Roblox friends list server-side for discovery/suggestions. Refresh on OAuth login and on-demand.
2. **LagaLaga native friendships** — Bidirectional friend graph with request/accept/remove/block flow. This is the durable, authoritative graph for access control.
3. **Friends-only session enforcement** — Sessions with `visibility = 'friends'` are visible only to accepted LagaLaga friends of the host (plus current participants).
4. **Hybrid friends UX** — A single "Friends" screen showing: LagaLaga friends, pending requests (in/out), and Roblox-friend suggestions (on-app first, then not-on-app for future invite flow).

### Non-Goals

- **Chat / messaging** — No DMs or in-app chat between friends.
- **Cross-platform friends** — Only Roblox as a source for friend discovery. No Discord, Steam, etc.
- **Real-time friend presence** — Existing Roblox presence endpoint can be composed by the client; no new WebSocket/push for friend online status.
- **Roblox friend-list write-back** — We never send friend requests on Roblox on behalf of the user.
- **Invite non-app users** — The "invite to app" flow (SMS/share link) is a follow-up, not MVP.
- **Mutual-friend counts / social graph analytics** — Not in scope.

---

## B. Proposed Data Model (DB)

### B.1 `roblox_friends_cache`

Per-user snapshot of their Roblox friends list.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | PK |
| `user_id` | `UUID NOT NULL` | FK → `app_users.id` ON DELETE CASCADE |
| `roblox_friend_user_id` | `TEXT NOT NULL` | Roblox numeric user ID (string for consistency with `user_platforms.platform_user_id`) |
| `roblox_friend_username` | `TEXT` | Display-only, updated on each sync |
| `roblox_friend_display_name` | `TEXT` | Display-only |
| `synced_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | When this row was written |

**Constraints & Indexes:**
- `UNIQUE (user_id, roblox_friend_user_id)` — prevents duplicates per user
- Index on `(roblox_friend_user_id)` — to find "which app users are friends with Roblox user X" for cross-referencing
- Index on `(user_id, synced_at)` — for TTL-based staleness checks

**Sync strategy:** Full replace per user (DELETE + batch INSERT in a transaction) — simpler than diffing, and the row count per user is bounded by Roblox's friend limit (200).

### B.2 `friendships`

App-native LagaLaga friendships. Stores one row per directional relationship pair (canonical ordering).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid()` | PK |
| `user_id` | `UUID NOT NULL` | FK → `app_users.id` ON DELETE CASCADE. Always the lexicographically smaller UUID. |
| `friend_id` | `UUID NOT NULL` | FK → `app_users.id` ON DELETE CASCADE. Always the lexicographically larger UUID. |
| `status` | `TEXT NOT NULL DEFAULT 'pending'` | One of: `pending`, `accepted`, `blocked` |
| `initiated_by` | `UUID NOT NULL` | FK → `app_users.id`. Who sent the request. |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | When request was sent |
| `accepted_at` | `TIMESTAMPTZ` | When accepted (NULL if pending/blocked) |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Last status change |

**Constraints & Indexes:**
- `UNIQUE (user_id, friend_id)` — one row per pair
- `CHECK (user_id < friend_id)` — canonical ordering invariant
- Index on `(friend_id, status)` — for lookups from the other direction
- Index on `(user_id, status)` — for "my friends" queries
- Index on `(status) WHERE status = 'pending'` — partial index for pending request queries

**Why canonical ordering?** A single row represents both directions. `user_id < friend_id` is enforced via CHECK constraint. The service layer handles ordering before insert/query. This avoids duplicate/conflicting rows and simplifies "are these two users friends?" checks to a single row lookup.

### B.3 Enums / Types

No new Postgres enums needed — use TEXT columns with CHECK constraints or application-level validation (consistent with existing `sessions.visibility` and `sessions.status` which are TEXT, not enums).

Friendship status values: `'pending'`, `'accepted'`, `'blocked'`

### B.4 RLS Approach

Backend uses `service_role` key (bypasses RLS), so RLS is defense-in-depth only. Still, add policies:

- `roblox_friends_cache`: Users can SELECT their own rows. No direct INSERT/UPDATE/DELETE (service_role only).
- `friendships`: Users can SELECT rows where they are `user_id` or `friend_id`. No direct mutations.

---

## C. Token / Sync Strategy

### C.1 Roblox Friends API (VERIFIED ✅)

**Confirmed approach:** Use the **public Roblox friends API** which requires NO authentication:

1. **Friends list:** `GET https://friends.roblox.com/v1/users/{userId}/friends`
   - Returns: `{ "data": [{ "id": 123, "name": "", "displayName": "" }] }`
   - **Important:** Due to a Roblox privacy change, the API returns friend IDs but empty strings for `name` and `displayName`

2. **Batch user lookup:** `POST https://users.roblox.com/v1/users`
   - Request body: `{ "userIds": [123, 456, 789], "excludeBannedUsers": false }`
   - Returns: `{ "data": [{ "id": 123, "name": "Username", "displayName": "Display Name", "hasVerifiedBadge": true }] }`
   - Supports up to 100 user IDs per request

**Implementation:** Two-step sync process:
1. Fetch friend IDs from friends API
2. Batch-fetch usernames/display names from users API (batches of 100)

### C.2 When Friends Are Synced

1. **At OAuth callback** — After successful Roblox login, fire-and-forget background sync of the user's Roblox friends. Non-blocking; login succeeds regardless.
2. **On-demand refresh** — `POST /api/user/friends/refresh` triggers a re-sync. Rate-limited to 1 per 5 minutes per user.
3. **TTL-based staleness** — When reading friends data, if `synced_at` is older than 1 hour, return cached data but hint the client to call refresh. Do NOT auto-sync on read (keeps reads fast and predictable).

### C.3 Sync Process

1. Look up user's `roblox_user_id` from `user_platforms` or `app_users`.
2. Call Roblox friends API: `GET https://friends.roblox.com/v1/users/{robloxUserId}/friends` → returns friend IDs
3. Batch-fetch usernames: `POST https://users.roblox.com/v1/users` with friend IDs in groups of 100 → returns names/displayNames
4. If either Roblox API fails: log warning, return existing cache, do NOT clear cache.
5. If successful: within a transaction, DELETE all rows for this `user_id` in `roblox_friends_cache`, then batch INSERT new rows with usernames.
6. Cross-reference: JOIN `roblox_friends_cache` with `app_users` (on `roblox_user_id`) or `user_platforms` (on `platform_user_id`) to identify which Roblox friends are on LagaLaga.

### C.4 Rate Limiting & Retry

- Use existing `withRetry` for the Roblox API call (max 2 retries, 500ms base delay).
- Consider a `CircuitBreaker` instance for the Roblox friends API (separate from presence circuit breaker) — open after 5 failures, 60s reset.
- Rate limit the refresh endpoint: 1 call per 5 minutes per user (use in-memory Map with TTL, or a simple DB timestamp check on `synced_at`).

### C.5 When Roblox Token Is Unavailable

For the **public API approach**, the user's OAuth token is not needed — we only need their `roblox_user_id`. If `roblox_user_id` is null (shouldn't happen since all users auth via Roblox), return an empty friend list with a clear error message.

If we fall back to the authenticated API and the token is unavailable/expired/unrefreshable, return the stale cache with a `robloxSyncStatus: 'unavailable'` field so the client can show "Roblox friends may be outdated — re-link your Roblox account."

---

## D. Backend API Design

All endpoints are authenticated (require valid JWT via `authenticate` middleware). All responses use the existing `{ success, data, requestId }` / `{ success, error }` envelope.

### D.1 `GET /api/user/friends`

**Purpose:** Hybrid grouped response — LagaLaga friends, pending requests, Roblox suggestions.

**Query params:**
- `section` (optional): `'all'` | `'lagalaga'` | `'requests'` | `'roblox_suggestions'` — defaults to `'all'`

**Response (`section=all`):**
```json
{
  "success": true,
  "data": {
    "lagalaFriends": [
      {
        "userId": "uuid",
        "robloxUsername": "Player1",
        "robloxDisplayName": "Cool Player",
        "avatarHeadshotUrl": "https://...",
        "friendshipId": "uuid",
        "acceptedAt": "2026-02-14T..."
      }
    ],
    "requests": {
      "incoming": [
        {
          "friendshipId": "uuid",
          "fromUser": { "userId": "uuid", "robloxUsername": "...", "robloxDisplayName": "...", "avatarHeadshotUrl": "..." },
          "createdAt": "..."
        }
      ],
      "outgoing": [
        {
          "friendshipId": "uuid",
          "toUser": { "userId": "uuid", "robloxUsername": "...", "robloxDisplayName": "...", "avatarHeadshotUrl": "..." },
          "createdAt": "..."
        }
      ]
    },
    "robloxSuggestions": {
      "onApp": [
        {
          "userId": "uuid",
          "robloxUsername": "...",
          "robloxDisplayName": "...",
          "avatarHeadshotUrl": "...",
          "alreadyFriend": false,
          "pendingRequest": false
        }
      ],
      "notOnApp": [
        {
          "robloxUserId": "12345",
          "robloxUsername": "...",
          "robloxDisplayName": "..."
        }
      ],
      "syncedAt": "2026-02-14T...",
      "isStale": false
    }
  }
}
```

**Authorization:** Authenticated user can only see their own friend data. User ID is extracted from JWT, not a URL param.

### D.2 `POST /api/user/friends/refresh`

**Purpose:** Trigger re-sync of Roblox friends cache.

**Request body:** None.

**Response:**
```json
{
  "success": true,
  "data": {
    "syncedCount": 47,
    "onAppCount": 5,
    "syncedAt": "2026-02-14T..."
  }
}
```

**Rate limit:** 1 per 5 minutes per user. Returns 429 with `RATE_LIMIT_EXCEEDED` if called too soon.

### D.3 `POST /api/friends/request`

**Purpose:** Send a friend request.

**Request body:**
```json
{ "targetUserId": "uuid" }
```

**Validation:**
- Cannot friend yourself
- Target user must exist
- No existing accepted friendship
- No existing pending request (in either direction)
- Target has not blocked you

**Response:** `{ success: true, data: { friendshipId: "uuid", status: "pending" } }`

**Error codes:** `FRIEND_SELF_REQUEST`, `FRIEND_ALREADY_EXISTS`, `FRIEND_REQUEST_EXISTS`, `FRIEND_BLOCKED`, `NOT_FOUND_USER`

### D.4 `POST /api/friends/accept`

**Purpose:** Accept a pending friend request.

**Request body:**
```json
{ "friendshipId": "uuid" }
```

**Validation:**
- Friendship must exist with status `'pending'`
- Current user must be the *recipient* (not the initiator)

**Response:** `{ success: true, data: { friendshipId: "uuid", status: "accepted", acceptedAt: "..." } }`

**Error codes:** `FRIEND_NOT_FOUND`, `FRIEND_NOT_PENDING`, `FRIEND_NOT_RECIPIENT`

### D.5 `POST /api/friends/reject`

**Purpose:** Reject (delete) a pending friend request.

**Request body:**
```json
{ "friendshipId": "uuid" }
```

**Validation:**
- Friendship must exist with status `'pending'`
- Current user must be the *recipient*

**Response:** `{ success: true, data: { removed: true } }`

### D.6 `DELETE /api/friends/:friendshipId`

**Purpose:** Remove an accepted friendship (unfriend) or cancel an outgoing request.

**Validation:**
- Friendship must exist
- Current user must be one of the two parties
- If status is `'pending'`, only the initiator can cancel

**Response:** `{ success: true, data: { removed: true } }`

### D.7 `POST /api/friends/block` (optional, lower priority)

**Purpose:** Block a user. Deletes any existing friendship/request and prevents future requests.

**Request body:**
```json
{ "targetUserId": "uuid" }
```

### D.8 Error Codes to Add

Add to `shared/errors/codes.ts`:

```
FRIEND_SELF_REQUEST: 'FRIEND_001'
FRIEND_ALREADY_EXISTS: 'FRIEND_002'
FRIEND_REQUEST_EXISTS: 'FRIEND_003'
FRIEND_BLOCKED: 'FRIEND_004'
FRIEND_NOT_FOUND: 'FRIEND_005'
FRIEND_NOT_PENDING: 'FRIEND_006'
FRIEND_NOT_RECIPIENT: 'FRIEND_007'
FRIEND_SYNC_FAILED: 'FRIEND_008'
FRIEND_RATE_LIMITED: 'FRIEND_009'
```

Add `'friend'` to the `ErrorCategory` union and a `FRIEND_` prefix check in `getErrorCategory()`.

---

## E. "Friends-Only Sessions" Enforcement

### E.1 The Rule

A session with `visibility = 'friends'` is accessible if ANY of:
1. The requesting user **is the host**.
2. The requesting user has an **accepted LagaLaga friendship** with the host.
3. The requesting user is **already a participant** (state = `'joined'` or `'invited'`).

**Important:** This uses LagaLaga friendships, NOT Roblox friendships. Roblox friends who haven't added each other on LagaLaga cannot see friends-only sessions.

### E.2 Where Enforcement Occurs

1. **`list_sessions_optimized` (SQL function)** — Must be updated to accept a `p_requester_id UUID` parameter. When `p_visibility = 'friends'` or is NULL (showing all), filter friends-only sessions to only those where the requester satisfies the rule above.

   The SQL change: add a LEFT JOIN or EXISTS subquery on `friendships` and `session_participants` to filter rows where `visibility = 'friends'`.

2. **`GET /api/sessions/:id` (getSessionById)** — After fetching, if `visibility = 'friends'`, check the friendship rule. Return 404 (not 403, to avoid leaking session existence) if not authorized.

3. **`POST /api/sessions/:id/join` (joinSession)** — Before joining, if `visibility = 'friends'`, verify the friendship rule. Return 403 with `FRIEND_NOT_AUTHORIZED` if not a friend of the host.

4. **`GET /api/user/sessions`** — No change needed; user is always the host of their own planned sessions.

### E.3 Query Strategy for `list_sessions_optimized`

Modify the WHERE clause:

```
AND (
  s.visibility != 'friends'
  OR s.host_id = p_requester_id
  OR EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = LEAST(p_requester_id, s.host_id) AND f.friend_id = GREATEST(p_requester_id, s.host_id))
      )
  )
  OR EXISTS (
    SELECT 1 FROM session_participants sp2
    WHERE sp2.session_id = s.id AND sp2.user_id = p_requester_id AND sp2.state IN ('joined', 'invited')
  )
)
```

### E.4 Indexes Needed

- `friendships(user_id, friend_id) WHERE status = 'accepted'` — partial unique index, already covered by the UNIQUE constraint + the status partial index.
- The `friendships(user_id, status)` and `friendships(friend_id, status)` indexes from section B cover the join/exists patterns.
- No new indexes on `session_participants` needed — the existing PK `(session_id, user_id)` covers the EXISTS check.

---

## F. Mobile UX / Screens

### F.1 Navigation Placement

Add a **third tab** to the tab bar: "Friends" with a `person.2.fill` SF Symbol icon. Placed between Home and Explore.

File: `app/(tabs)/friends.tsx`

### F.2 Screen Sections

The Friends screen is a single scrollable screen with collapsible sections:

#### Section 1: Friend Requests (only shown if count > 0)
- **Incoming requests:** Avatar + name + "Accept" / "Decline" buttons
- **Outgoing requests:** Avatar + name + "Cancel" label/button
- Badge count on tab icon for incoming requests

#### Section 2: LagaLaga Friends
- List of accepted friends: avatar, display name, username
- Each row: "Remove" action (swipe or long-press menu)
- Tappable to view profile (future) or start session with friend
- Empty state: "No friends yet. Add friends from your Roblox friends below!"

#### Section 3: Roblox Suggestions
- Sub-header: "From Your Roblox Friends"
- **On-app users:** Avatar + name + "Add Friend" button
- **Not-on-app users** (lower priority): Roblox avatar + name + "Invite" (grayed out for MVP, or deep link share)
- "Refresh" button with last-synced timestamp
- If stale (>1hr): subtle "Tap to refresh" prompt

### F.3 UI States

| State | Behavior |
|---|---|
| Loading | Skeleton placeholders for each section |
| Empty (no friends, no suggestions) | Friendly illustration + "Connect with your Roblox friends!" |
| Error (API failure) | Error banner with "Retry" button (use `useErrorHandler`) |
| Roblox sync unavailable | "Roblox friends may be outdated" info banner |
| Refresh in progress | Spinner on refresh button, sections remain visible |

### F.4 Actions Per Row

| Context | Actions |
|---|---|
| LagaLaga friend | Remove (confirmation dialog) |
| Incoming request | Accept, Decline |
| Outgoing request | Cancel |
| Roblox suggestion (on-app) | Add Friend |
| Roblox suggestion (not-on-app) | Invite (future) |

### F.5 Frontend API Client Extension

Add to `ApiClient`:
```
friends = {
  list(section?)
  refresh()
  sendRequest(targetUserId)
  acceptRequest(friendshipId)
  rejectRequest(friendshipId)
  remove(friendshipId)
}
```

---

## G. Observability & Ops

### G.1 Logging

All friend operations log with structured fields:
- `userId` (sanitized — no PII beyond user ID)
- `targetUserId` (for request/accept/remove)
- `friendshipId`
- `action`: `'friend_request'`, `'friend_accept'`, `'friend_reject'`, `'friend_remove'`, `'roblox_sync'`
- `correlationId` / `requestId` (existing pattern)

**Sanitization rules:**
- Never log Roblox access tokens
- Roblox usernames are NOT PII in this context (public profile data), OK to log
- User UUIDs are internal IDs, OK to log

### G.2 Metrics

Add to existing Prometheus `/metrics` endpoint:

| Metric | Type | Labels |
|---|---|---|
| `friends_roblox_sync_total` | Counter | `status=success\|failure` |
| `friends_roblox_sync_duration_ms` | Histogram | — |
| `friends_roblox_sync_count` | Histogram | (number of friends returned per sync) |
| `friends_cache_age_seconds` | Gauge | (sampled on read) |
| `friends_request_total` | Counter | `action=send\|accept\|reject\|remove` |
| `friends_session_filter_total` | Counter | `result=allowed\|denied` |

### G.3 Alerts (Future)

- Roblox sync failure rate > 50% over 5 minutes → investigate Roblox API issues
- Friends cache staleness > 24 hours for active users → sync may be broken
- Unusual spike in friend request volume (potential spam/abuse)

---

## H. Rollout Plan

### H.1 Feature Flag Strategy

Use a simple boolean config flag `FEATURE_FRIENDS_ENABLED` (env var). When disabled:
- Friends tab hidden in mobile nav
- Friends API endpoints return 404
- Session visibility `'friends'` treated as `'public'` (graceful fallback)

This allows deploying the backend changes before the mobile app update is live.

### H.2 Migration Considerations

- No backfill needed — there are no existing friendships to migrate.
- The `roblox_friends_cache` table starts empty; it populates on first login/refresh per user.
- Existing sessions with `visibility = 'friends'` exist in the wild — once enforcement is turned on, they become visible only to the host (until they have friends). Document this in release notes.

### H.3 PR Plan

#### PR 1: Database Schema + Shared Types
- Migration: Create `friendships` table with constraints and indexes
- Migration: Create `roblox_friends_cache` table with constraints and indexes
- Add RLS policies (defense-in-depth)
- Add friend error codes to `shared/errors/codes.ts`
- Add shared types for friendship status, friend response shapes
- **Tests:** Migration up/down, constraint checks (unit SQL tests or integration test that verifies table structure)

#### PR 2: Roblox Friends Sync Service
- `backend/src/services/roblox-friends.service.ts` — fetch from Roblox API, write to cache
- Integration with `RobloxConnectionService` for user ID lookup
- Circuit breaker + retry for Roblox API
- Rate limiting for refresh endpoint
- `POST /api/user/friends/refresh` route
- Hook into OAuth callback for fire-and-forget sync
- **Tests:** Unit tests for sync logic (mock Roblox API). Integration test for refresh endpoint. Test rate limiting.

#### PR 3: LagaLaga Friendship CRUD
- `backend/src/services/friendship.service.ts` — request, accept, reject, remove, block
- Canonical ordering logic
- `POST /api/friends/request`, `POST /api/friends/accept`, `POST /api/friends/reject`, `DELETE /api/friends/:id`
- `GET /api/user/friends` — hybrid response assembling all three sections
- **Tests:** Unit tests for friendship service (canonical ordering, status transitions, validation). Integration tests for all endpoints. Test duplicate request handling, self-request, etc.

#### PR 4: Friends-Only Session Enforcement
- Update `list_sessions_optimized` SQL function to accept `p_requester_id` and filter friends-only sessions
- Update `SessionServiceV2.listSessions()` to pass requester ID
- Update `getSessionById()` and `joinSession()` to enforce friendship check
- Update sessions-v2 routes to pass authenticated user ID to list queries
- **Tests:** Integration tests: create friends-only session, verify visible to friend, invisible to non-friend. Test join enforcement. Test that public/invite_only sessions are unaffected.

#### PR 5: Mobile Friends Screen
- New `app/(tabs)/friends.tsx` tab
- Update tab layout with Friends tab
- `src/lib/api.ts` — add `friends` namespace methods
- Friend list, request list, Roblox suggestions UI components
- Loading/empty/error states
- Send request, accept, reject, remove actions
- Refresh Roblox friends button
- **Tests:** Component render tests (React Native Testing Library). Test API client methods (mock). Manual smoke test on device.

#### PR 6 (Follow-up): Polish & Badge
- Tab badge count for incoming friend requests
- Pull-to-refresh on friends screen
- Optimistic UI updates for accept/remove
- Avatar caching for friend rows
- **Tests:** Visual regression / manual QA.

---

## I. Open Questions & Decisions

### Must Verify

1. ✅ ~~**Roblox public friends API availability**~~ — VERIFIED: Works without auth. Returns IDs only; need batch users API for names.

2. **Roblox friends API rate limits** — What are the rate limits for the public friends/users endpoints? If tight, we may need to be more aggressive with caching or queue syncs.
   - **How to verify:** Check Roblox API docs or test empirically. Monitor for 429 responses.

3. **Roblox friend count cap and pagination** — Roblox allows up to 200 friends. Test confirmed API returns array without pagination fields for <100 friends. Need to verify behavior for users with 200 friends.
   - **How to verify:** Test with a user account that has 200 friends. Check for `nextPageCursor` or similar fields.

4. ✅ ~~**`session_participants` table PK**~~ — VERIFIED: Composite PK `(session_id, user_id)`, no separate `id` column. The SQL function in `list_sessions_optimized` uses `COUNT(DISTINCT sp.id)` which should be `COUNT(DISTINCT sp.user_id)` or just `COUNT(*)` since the join is already unique per user. This is a **pre-existing bug** but doesn't affect correctness (Postgres allows it).

### Design Decisions to Finalize

5. **Block vs. just reject** — Should MVP include blocking? Blocking prevents future requests and hides the blocker from the blocked user's suggestions. Recommended for MVP to handle harassment, but could defer to PR 6.

6. **Canonical ordering direction** — Plan proposes `user_id < friend_id` (UUID lexicographic comparison). This is deterministic and simple. Alternative: always store `(requester, target)` with a `direction` column — more intuitive but requires two-row lookups. **Recommendation:** Stick with canonical ordering.

7. **Friends count on session cards** — Should session list items show "X of your friends are in this session"? Nice UX but adds query complexity. **Recommendation:** Defer to follow-up.

8. **Notification system** — Friend requests ideally trigger push notifications. No push notification infrastructure exists yet. **Recommendation:** Defer; the badge count on the Friends tab is sufficient for MVP.

9. **`list_sessions_optimized` backward compatibility** — Adding `p_requester_id` parameter changes the function signature. Existing callers pass positional args. Options: (a) add as last param with DEFAULT NULL (backward compatible), (b) create a new function `list_sessions_v2`. **Recommendation:** Option (a) — add with DEFAULT NULL so existing calls continue to work unchanged.

10. **Avatar headshots for Roblox-only suggestions** — For Roblox friends not on LagaLaga, we don't have cached avatars. Options: (a) fetch from Roblox thumbnails API during sync (adds latency), (b) return placeholder, let client fetch on-demand. **Recommendation:** Option (b) for MVP — return the Roblox user ID and let the client use a generic avatar or fetch thumbnails client-side.
