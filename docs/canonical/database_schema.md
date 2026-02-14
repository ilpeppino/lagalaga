# LagaLaga Database Schema

This document describes the complete database schema for LagaLaga as deployed on Supabase and replicated for on-premise installations.

## Overview

The database consists of 10 main tables organized into several functional areas:
- **User Management**: `app_users`, `user_platforms`
- **Platform Support**: `platforms`
- **Gaming Sessions**: `games`, `sessions`, `session_participants`, `session_invites`
- **Social Features**: `friendships`, `roblox_friends_cache`
- **Caching**: `roblox_experience_cache`

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  avatar_headshot_url TEXT,
  avatar_cached_at TIMESTAMPTZ
);
```

**Indexes:**
- `app_users_pkey` - Primary key on `id`
- `app_users_roblox_user_id_key` - Unique constraint on `roblox_user_id`
- `idx_app_users_roblox_user_id` - Index for Roblox user lookups

**RLS Policies:**
- Public SELECT for all users
- Service role only for INSERT/UPDATE/DELETE

**Comments:**
- `avatar_headshot_url`: Cached Roblox avatar headshot URL
- `avatar_cached_at`: Timestamp when avatar was last cached

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

App-native LagaLaga friendships using canonical ordering (user_id < friend_id).

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

  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES app_users(id) ON DELETE CASCADE,
  FOREIGN KEY (initiated_by) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT chk_friendships_canonical_order CHECK (user_id < friend_id),
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

Per-user snapshot of Roblox friends for discovery and suggestions.

```sql
CREATE TABLE roblox_friends_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  roblox_friend_user_id TEXT NOT NULL,
  roblox_friend_username TEXT,
  roblox_friend_display_name TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT uq_roblox_friends_cache_user_friend UNIQUE (user_id, roblox_friend_user_id)
);
```

**Indexes:**
- `roblox_friends_cache_pkey` - Primary key
- `uq_roblox_friends_cache_user_friend` - Unique constraint
- `idx_roblox_friends_cache_roblox_user_id` - Friend lookups
- `idx_roblox_friends_cache_user_synced` - Sync time tracking

**RLS Policies:**
- Users can SELECT their own cached friends
- Service role for modifications

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

**RLS:** Disabled (read-only cache table)

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

Migrations are executed in this order (Supabase timestamps):

1. `20260207172512` - Core schema (games, sessions, platforms, user_platforms)
2. `20260211000000` - Create app_users table
3. `20260211135258` - Complete RLS policies
4. `20260211135359` - Enable RLS policies (drop + recreate)
5. `20260211223803` - Add thumbnail to games
6. `007` - Add roblox_experience_cache (manual table)
7. `20260214101822` - Hybrid friends schema
8. `20260214131531` - Enforce friends sessions (update function)
9. `20260214135005` - Handoff presence tracking
10. `20260214135021` - Sessions schema contract (FK migration)
11. `20260214140159` - Avatar cache fields
12. `20260214142007` - Align user_platforms FK

See `supabase/migrations/MIGRATION_ORDER.md` for detailed migration documentation.

---

## Security Model

### Row Level Security (RLS)

All tables have RLS enabled except `roblox_experience_cache`.

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
