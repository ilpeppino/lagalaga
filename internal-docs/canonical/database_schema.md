# LagaLaga Database Schema

This document describes the complete database schema for LagaLaga as deployed on Supabase and replicated for on-premise installations.

> Last updated: 2026-02-18. For the authoritative live schema see `database-schema.md` (generated from Supabase).

## Overview

The database consists of 21 tables organized into several functional areas:
- **User Management**: `app_users`, `user_platforms`
- **Platform Support**: `platforms`
- **Gaming Sessions**: `games`, `sessions`, `session_participants`, `session_invites`, `session_invited_roblox`
- **Social Features**: `friendships`, `roblox_friends_cache`, `roblox_friends_cache_legacy`
- **Caching**: `roblox_experience_cache`, `user_favorites_cache`
- **Notifications**: `user_push_tokens`
- **Gamification**: `user_stats`, `user_achievements`, `user_rankings`, `match_results`, `seasons`, `season_rankings`
- **Account Management**: `account_deletion_requests`

## Custom Types (Enums)

### session_visibility
Controls who can see and join a session.
- `public` - Visible to everyone
- `friends` - Visible to friends only
- `invite_only` - Visible only via invite link

### session_status
Tracks the lifecycle of a session.
- `scheduled` - Future session, not yet started
- `active` - Currently ongoing
- `completed` - Finished successfully
- `cancelled` - Cancelled by host

### participant_role
User's role within a session.
- `host` - Session creator
- `member` - Regular participant

### participant_state
Participant's current status.
- `invited` - Invited but not yet joined
- `joined` - Active participant
- `left` - Left the session
- `kicked` - Removed by host

## Tables

### app_users

Stores user accounts linked via Roblox OAuth. This is the primary user identity table.

```sql
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roblox_user_id VARCHAR NOT NULL UNIQUE,
  roblox_username VARCHAR NOT NULL,
  roblox_display_name VARCHAR,
  roblox_profile_url TEXT,
  avatar_headshot_url TEXT,        -- Cached Roblox avatar headshot URL
  avatar_cached_at TIMESTAMPTZ,    -- Timestamp when avatar was last cached
  status TEXT NOT NULL DEFAULT 'ACTIVE',  -- CHECK: ACTIVE | PENDING_DELETION | DELETED
  token_version INTEGER NOT NULL DEFAULT 0, -- Incremented to invalidate all JWTs
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
```

**Indexes:**
- `app_users_pkey` - Primary key on `id`
- `app_users_roblox_user_id_key` - Unique constraint on `roblox_user_id`
- `idx_app_users_roblox_user_id` - Index for Roblox user lookups
- `idx_app_users_status` - Index for status filtering

**RLS Policies:**
- Public SELECT for all users
- Service role only for INSERT/UPDATE/DELETE

---

### platforms

Reference table for supported gaming platforms.

```sql
CREATE TABLE platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_url TEXT,
  deep_link_scheme TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Initial Data:**
- `roblox` - Roblox platform with deep link `roblox://`
- `discord` - Discord platform (for future use)
- `steam` - Steam platform (for future use)

**RLS Policies:**
- Public SELECT for all users
- Service role only for modifications

---

### user_platforms

Links users to their accounts on various gaming platforms. Stores OAuth tokens for Roblox.

```sql
CREATE TABLE user_platforms (
  user_id UUID NOT NULL,
  platform_id TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  platform_display_name TEXT,
  platform_avatar_url TEXT,
  is_primary BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  roblox_access_token_enc TEXT,
  roblox_refresh_token_enc TEXT,
  roblox_token_expires_at TIMESTAMPTZ,
  roblox_scope TEXT,

  PRIMARY KEY (user_id, platform_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  FOREIGN KEY (platform_id) REFERENCES platforms(id),
  UNIQUE (platform_id, platform_user_id)
);
```

**Indexes:**
- `user_platforms_pkey` - Primary key on `(user_id, platform_id)`
- `user_platforms_platform_id_platform_user_id_key` - Unique platform account
- `idx_user_platforms_user_id` - Lookup by user
- `idx_user_platforms_platform_user` - Lookup by platform account
- `idx_user_platforms_roblox_token_expiry` - Token expiration tracking

**RLS Policies:**
- Users can view their own platforms
- Public SELECT for display names (participant lists)
- Service role only for modifications

---

### games

Catalog of Roblox games/experiences.

```sql
CREATE TABLE games (
  place_id BIGINT PRIMARY KEY,
  canonical_web_url TEXT NOT NULL,
  canonical_start_url TEXT NOT NULL,
  game_name TEXT,
  game_description TEXT,
  thumbnail_url TEXT,
  max_players INTEGER,
  creator_id BIGINT,
  creator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Indexes:**
- `games_pkey` - Primary key on `place_id`
- `idx_games_name` - Game name lookups
- `idx_games_creator` - Creator lookups
- `idx_games_canonical_url` - URL lookups
- `idx_games_thumbnail_url` - Partial index on non-null thumbnails

**RLS Policies:**
- Public SELECT for all users
- Service role only for modifications

**Triggers:**
- `update_games_updated_at` - Auto-update `updated_at` on changes

---

### sessions

Gaming sessions organized by users.

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id BIGINT NOT NULL,
  host_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  visibility session_visibility NOT NULL DEFAULT 'public',
  status session_status NOT NULL DEFAULT 'scheduled',
  max_participants INTEGER NOT NULL DEFAULT 10,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  original_input_url TEXT NOT NULL,
  normalized_from TEXT NOT NULL,
  is_ranked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  FOREIGN KEY (place_id) REFERENCES games(place_id),
  FOREIGN KEY (host_id) REFERENCES app_users(id),
  CONSTRAINT max_participants CHECK (max_participants > 0)
);
```

**Indexes:**
- `sessions_pkey` - Primary key
- `idx_sessions_host` - Host lookups
- `idx_sessions_place` - Game lookups
- `idx_sessions_status` - Status filtering
- `idx_sessions_visibility` - Visibility filtering
- `idx_sessions_scheduled_start` - Time-based queries
- `idx_sessions_created_at` - Recent sessions
- `idx_sessions_host_status` - Composite for active/scheduled by host
- `idx_sessions_place_status` - Composite for active/scheduled by game
- `idx_sessions_status_scheduled` - Composite for active listing
- `idx_sessions_is_ranked_created_at` - Ranked session queries

**RLS Policies:**
- Public sessions: SELECT by anyone
- Private sessions: SELECT by participants and host only
- Service role: INSERT only
- Hosts: UPDATE and DELETE their own sessions

**Triggers:**
- `update_sessions_updated_at` - Auto-update `updated_at` on changes

---

### session_participants

Tracks user participation in sessions.

```sql
CREATE TABLE session_participants (
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role participant_role NOT NULL DEFAULT 'member',
  state participant_state NOT NULL DEFAULT 'joined',
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  handoff_state TEXT NOT NULL DEFAULT 'rsvp_joined',

  PRIMARY KEY (session_id, user_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT session_participants_handoff_state_check
    CHECK (handoff_state IN ('rsvp_joined', 'opened_roblox', 'confirmed_in_game', 'stuck'))
);
```

**handoff_state Values:**
- `rsvp_joined` - User joined the session in the app
- `opened_roblox` - User opened Roblox via deep link
- `confirmed_in_game` - User presence confirmed in Roblox
- `stuck` - User encountered issues joining

**Indexes:**
- `session_participants_pkey` - Primary key
- `idx_participants_user` - User's sessions
- `idx_participants_session_state` - Session participant list
- `idx_session_participants_session_id` - Session lookups
- `idx_session_participants_session_handoff_state` - Handoff tracking
- `idx_session_participants_session_state` - Joined participants (partial)
- `idx_session_participants_user_state` - User's joined sessions (partial)

**RLS Policies:**
- Public sessions: SELECT participants
- Private sessions: SELECT by participants and host only
- Service role only for modifications

---

### session_invites

Invite codes for sharing sessions.

```sql
CREATE TABLE session_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  created_by UUID NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES app_users(id),
  CONSTRAINT max_uses CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT uses_count CHECK (uses_count >= 0)
);
```

**Indexes:**
- `session_invites_pkey` - Primary key
- `session_invites_invite_code_key` - Unique invite codes
- `idx_invites_session` - Session's invites
- `idx_invites_code` - Invite code lookups
- `idx_invites_expires` - Expiration tracking
- `idx_session_invites_code` - Duplicate of above
- `idx_session_invites_session_id` - Duplicate of session lookup
- `idx_session_invites_expired` - Partial index on expired invites

**RLS Policies:**
- Public SELECT for invite code lookups
- Hosts can SELECT their session's invites
- Service role only for modifications

---

### friendships

App-native LagaLaga friendships.

```sql
CREATE TABLE friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  initiated_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id),
  FOREIGN KEY (friend_id) REFERENCES app_users(id),
  FOREIGN KEY (initiated_by) REFERENCES app_users(id),
  CONSTRAINT chk_friendships_status CHECK (status IN ('pending', 'accepted', 'blocked')),
  CONSTRAINT uq_friendships_user_friend UNIQUE (user_id, friend_id)
);
```

**Status Values:**
- `pending` - Friend request sent
- `accepted` - Friendship confirmed
- `blocked` - User blocked

**Indexes:**
- `friendships_pkey` - Primary key
- `uq_friendships_user_friend` - Unique pair constraint
- `idx_friendships_user_status` - User's friendships by status
- `idx_friendships_friend_status` - Friend lookups
- `idx_friendships_pending` - Partial index for pending requests

**RLS Policies:**
- Users can SELECT their own friendships (either side)
- Service role for modifications

---

### roblox_friends_cache

Per-user blob cache of Roblox friends list. One row per user, replaces `roblox_friends_cache_legacy`.

```sql
CREATE TABLE roblox_friends_cache (
  user_id UUID PRIMARY KEY,
  roblox_user_id BIGINT NOT NULL,
  friends_json JSONB NOT NULL DEFAULT '[]',  -- Full friends array from Roblox API
  etag TEXT,
  fetched_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id)
);
```

**Indexes:**
- `roblox_friends_cache_pkey1` - Primary key on user_id
- `idx_roblox_friends_cache_expires_at` - Expiration tracking

**RLS Policies:**
- Users can SELECT their own cache (auth.uid() = user_id)
- Service role only for INSERT/UPDATE/DELETE

---

### roblox_friends_cache_legacy

Legacy row-per-friend cache, superseded by `roblox_friends_cache`.

```sql
CREATE TABLE roblox_friends_cache_legacy (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  roblox_friend_user_id TEXT NOT NULL,
  roblox_friend_username TEXT,
  roblox_friend_display_name TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT uq_roblox_friends_cache_user_friend UNIQUE (user_id, roblox_friend_user_id)
);
```

**RLS Policies:**
- Authenticated users can SELECT their own cached friends

---

### roblox_experience_cache

Cache for Roblox experience/game metadata lookups.

```sql
CREATE TABLE roblox_experience_cache (
  id BIGSERIAL PRIMARY KEY,
  platform_key TEXT NOT NULL DEFAULT 'roblox',
  url TEXT NOT NULL UNIQUE,
  place_id TEXT NOT NULL,
  universe_id TEXT,
  name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**
- `roblox_experience_cache_pkey` - Primary key
- `roblox_experience_cache_url_key` - Unique URL constraint
- `idx_roblox_experience_cache_place_id` - Place ID lookups
- `idx_roblox_experience_cache_updated_at` - Cache staleness checks

**RLS:** Enabled (service role manages, everyone can SELECT)

---

### session_invited_roblox

Roblox users explicitly invited to a session before they have an app account.

```sql
CREATE TABLE session_invited_roblox (
  session_id UUID NOT NULL,
  roblox_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (session_id, roblox_user_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

**RLS Policies:** Service role only for all operations

---

### user_push_tokens

Expo push notification tokens per device.

```sql
CREATE TABLE user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  expo_push_token TEXT NOT NULL,
  device_id TEXT,
  platform TEXT,   -- CHECK: 'ios' | 'android' | 'web'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id),
  UNIQUE (user_id, expo_push_token)
);
```

**RLS Policies:** Service role only for all operations

---

### user_stats

Aggregate activity statistics per user.

```sql
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY,
  sessions_hosted INTEGER NOT NULL DEFAULT 0,
  sessions_joined INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id)
);
```

**RLS Policies:** Service role only for all operations

---

### user_achievements

Achievements unlocked by users.

```sql
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id),
  UNIQUE (user_id, code)
);
```

**RLS Policies:** Service role only for all operations

---

### user_rankings

Current competitive rankings (ELO-style).

```sql
CREATE TABLE user_rankings (
  user_id UUID PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  last_ranked_match_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id)
);
```

**RLS Policies:** Service role only for all operations

---

### match_results

Results for individual ranked session matches.

```sql
CREATE TABLE match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE,   -- one result per session
  winner_id UUID NOT NULL,
  rating_delta INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (winner_id) REFERENCES app_users(id)
);
```

**RLS Policies:** Service role only for all operations

---

### seasons

Competitive seasons.

```sql
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number INTEGER NOT NULL UNIQUE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_seasons_active` - Partial index for `is_active = true`

**RLS Policies:** Service role only for all operations

---

### season_rankings

End-of-season rating snapshots.

```sql
CREATE TABLE season_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL,
  user_id UUID NOT NULL,
  final_rating INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (season_id) REFERENCES seasons(id),
  FOREIGN KEY (user_id) REFERENCES app_users(id),
  UNIQUE (season_id, user_id)
);
```

**RLS Policies:** Service role only for all operations

---

### account_deletion_requests

GDPR/user-initiated account deletion lifecycle.

```sql
CREATE TABLE account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',   -- CHECK: PENDING | COMPLETED | CANCELED | FAILED
  initiator TEXT NOT NULL DEFAULT 'IN_APP', -- CHECK: IN_APP | WEB
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_purge_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id),
  -- Only one PENDING request per user:
  UNIQUE (user_id) WHERE (status = 'PENDING')
);
```

**Indexes:**
- `idx_account_deletion_requests_user_id`
- `idx_account_deletion_requests_requested_at` - (user_id, requested_at DESC)
- `idx_account_deletion_requests_status_scheduled` - (status, scheduled_purge_at) for job queries

**RLS Policies:**
- Users can SELECT their own deletion request
- Service role only for INSERT/UPDATE/DELETE

---

## Database Functions

### list_sessions_optimized

Optimized session listing with participant counts and friend filtering.

```sql
CREATE FUNCTION list_sessions_optimized(
  p_status TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT NULL,
  p_place_id BIGINT DEFAULT NULL,
  p_host_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_requester_id UUID DEFAULT NULL
)
RETURNS TABLE (...)
```

**Features:**
- Filters by status, visibility, place, and host
- Enforces friends-only visibility
- Returns denormalized game data
- Includes participant counts
- Pagination support

---

## Migration History

All 18 migrations applied to production (Supabase) as of 2026-02-18:

| # | Version | Name |
|---|---------|------|
| 1 | 20260207172512 | 001_core_schema |
| 2 | 20260211135258 | complete_rls_policies |
| 3 | 20260211135359 | enable_rls_policies |
| 4 | 20260211223803 | add_thumbnail_to_games |
| 5 | 20260214101822 | hybrid_friends_schema |
| 6 | 20260214131531 | 010_enforce_friends_sessions |
| 7 | 20260214135005 | 008_handoff_presence |
| 8 | 20260214135021 | 011_sessions_schema_contract |
| 9 | 20260214140159 | 012_add_avatar_cache_to_app_users |
| 10 | 20260214142007 | 013_align_user_platforms_fk_to_app_users |
| 11 | 20260214181902 | create_user_favorites_cache |
| 12 | 20260214192508 | add_roblox_friends_cache_and_session_invited_roblox |
| 13 | 20260214205053 | add_user_push_tokens |
| 14 | 20260216114056 | user_stats_achievements |
| 15 | 20260216135712 | ranked_sessions_and_ratings |
| 16 | 20260216144120 | seasons_and_match_history |
| 17 | 20260217203258 | account_deletion |
| 18 | 20260217221455 | rls_account_deletion_experience_favorites |

---

## Security Model

### Row Level Security (RLS)

All tables have RLS enabled.

**Service Role:**
- Bypasses RLS
- Used by backend API
- Full CRUD permissions

**Authenticated Users:**
- Can view public sessions and games
- Can view their own data
- Can view participants of sessions they're in
- Friends-only sessions respect friendship status

**Anonymous Users:**
- Can view public sessions
- Can view games
- Can use invite codes

### Authentication

The app uses:
- **Frontend**: Supabase anon key (enforces RLS)
- **Backend**: Custom JWT with `app_users.id` as subject
- **Backend API**: Service role key (bypasses RLS)

Foreign keys reference `app_users.id`, not `auth.users.id`.

---

## Performance Considerations

### Critical Indexes

1. **Sessions Listing:**
   - `idx_sessions_status_scheduled` - Active/scheduled sessions
   - `idx_sessions_created_at` - Recent sessions

2. **Participant Lookups:**
   - `idx_participants_session_state` - Session participant lists
   - `idx_session_participants_user_state` - User's active sessions

3. **Friend Filtering:**
   - `idx_friendships_user_status` - User's accepted friendships
   - Canonical ordering reduces index size by 50%

### Query Optimization

- Use `list_sessions_optimized()` function for session listings
- Partial indexes on common filters (status, expired invites)
- Composite indexes for common query patterns

---

## Data Retention

Currently no automated cleanup. Consider implementing:
- Archive completed/cancelled sessions after 30 days
- Expire invite codes after 7 days of inactivity
- Refresh Roblox friends cache every 24 hours
- Clear stale roblox_experience_cache entries after 7 days

---

## Backup and Recovery

For on-premise installations:
1. Use `pg_dump` for full database backups
2. Execute migrations in order from `EXECUTE_MIGRATIONS.sh`
3. Verify schema with `verify_schema.sql`
4. Test RLS policies with different user contexts

---

## Related Documentation

- Migration order: `supabase/migrations/MIGRATION_ORDER.md`
- Hybrid friends system: `docs/features/hybrid-friends.md`
- Error handling: Frontend uses error framework (see MEMORY.md)
