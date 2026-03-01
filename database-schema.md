# Database Schema — LagaLaga (Supabase / PostgreSQL)

> Last updated: 2026-03-01
> Project: `zbsvxhwilhkpabyybjdk` (Lagalaga, eu-west-1)
> PostgreSQL 17.6
>
> **Generated from actual migration history. Reflects all migrations as of 2026-03-01.**

---

## Enums

| Name | Values |
|------|--------|
| `session_visibility` | `public`, `friends`, `invite_only` |
| `session_status` | `scheduled`, `active`, `completed`, `cancelled` |
| `participant_role` | `host`, `member` |
| `participant_state` | `invited`, `joined`, `left`, `kicked` |
| `report_category` | `CSAM`, `GROOMING_OR_SEXUAL_EXPLOITATION`, `HARASSMENT_OR_ABUSIVE_BEHAVIOR`, `IMPERSONATION`, `OTHER` |
| `report_status` | `OPEN`, `UNDER_REVIEW`, `CLOSED`, `ESCALATED` |

---

## Tables

### `app_users`
Stores user accounts. Can be linked to Roblox and/or Google and/or Apple via the `user_platforms` table. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `roblox_user_id` | varchar | NULL | — | UNIQUE (when present); nullable for Google-first accounts |
| `roblox_username` | varchar | NULL | — | NULL until Roblox linked; supports Google-first sign-up |
| `roblox_display_name` | varchar | NULL | — | |
| `roblox_profile_url` | text | NULL | — | |
| `avatar_headshot_url` | text | NULL | — | Cached avatar URL (from Roblox or linked platform) |
| `avatar_cached_at` | timestamptz | NULL | — | When avatar was last cached |
| `status` | text | NOT NULL | `'ACTIVE'` | CHECK: `ACTIVE`, `PENDING_DELETION`, `DELETED` |
| `token_version` | integer | NOT NULL | `0` | Used for JWT invalidation on logout |
| `last_login_at` | timestamptz | NULL | — | |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_app_users_roblox_user_id`, `idx_app_users_status`

**RLS Policies:**
- SELECT: everyone (public)
- INSERT/UPDATE/DELETE: service_role only

---

### `games`
Roblox experiences/games referenced by sessions. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `place_id` | bigint | NOT NULL | — | PK (Roblox place ID) |
| `canonical_web_url` | text | NOT NULL | — | |
| `canonical_start_url` | text | NOT NULL | — | |
| `game_name` | text | NULL | — | |
| `game_description` | text | NULL | — | |
| `thumbnail_url` | text | NULL | — | |
| `max_players` | integer | NULL | — | |
| `creator_id` | bigint | NULL | — | Roblox creator ID |
| `creator_name` | text | NULL | — | |
| `created_at` | timestamptz | NULL | `now()` | |
| `updated_at` | timestamptz | NULL | `now()` | |

**Indexes:** `idx_games_canonical_url`, `idx_games_creator`, `idx_games_name`, `idx_games_thumbnail_url` (partial, NOT NULL)

**RLS Policies:**
- SELECT: everyone (public)
- INSERT/UPDATE/DELETE: service_role only

---

### `sessions`
Gaming sessions hosted by users. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `place_id` | bigint | NOT NULL | — | FK → `games.place_id` |
| `host_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `title` | text | NOT NULL | — | |
| `description` | text | NULL | — | |
| `visibility` | session_visibility | NOT NULL | `'public'` | |
| `status` | session_status | NOT NULL | `'scheduled'` | |
| `max_participants` | integer | NOT NULL | `10` | CHECK: > 0 |
| `scheduled_start` | timestamptz | NULL | — | |
| `scheduled_end` | timestamptz | NULL | — | |
| `original_input_url` | text | NOT NULL | — | |
| `normalized_from` | text | NOT NULL | — | |
| `is_ranked` | boolean | NOT NULL | `false` | |
| `created_at` | timestamptz | NULL | `now()` | |
| `updated_at` | timestamptz | NULL | `now()` | |

**Indexes:** `idx_sessions_host`, `idx_sessions_place`, `idx_sessions_status`, `idx_sessions_visibility`, `idx_sessions_scheduled_start`, `idx_sessions_created_at`, `idx_sessions_host_status` (partial: scheduled/active), `idx_sessions_place_status` (partial), `idx_sessions_status_scheduled` (partial), `idx_sessions_is_ranked_created_at`

**RLS Policies:**
- SELECT: public sessions (everyone); host's own sessions; sessions user participates in (joined)
- INSERT: service_role only
- UPDATE/DELETE: host of that session

---

### `session_participants`
Users participating in a session. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `session_id` | uuid | NOT NULL | — | PK, FK → `sessions.id` |
| `user_id` | uuid | NOT NULL | — | PK, FK → `app_users.id` |
| `role` | participant_role | NOT NULL | `'member'` | |
| `state` | participant_state | NOT NULL | `'joined'` | |
| `handoff_state` | text | NOT NULL | `'rsvp_joined'` | CHECK: `rsvp_joined`, `opened_roblox`, `confirmed_in_game`, `stuck` |
| `joined_at` | timestamptz | NULL | `now()` | |
| `left_at` | timestamptz | NULL | — | |

**Indexes:** `idx_participants_session_state`, `idx_participants_user`, `idx_session_participants_session_id`, `idx_session_participants_session_handoff_state`, `idx_session_participants_session_state` (partial: joined), `idx_session_participants_user_state` (partial: joined)

**RLS Policies:**
- SELECT: public session participants (everyone); participants of sessions user hosts; own session participations
- INSERT/UPDATE/DELETE: service_role only

---

### `session_invites`
Invite codes for sessions. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `session_id` | uuid | NOT NULL | — | FK → `sessions.id` |
| `created_by` | uuid | NOT NULL | — | FK → `app_users.id` |
| `invite_code` | text | NOT NULL | — | UNIQUE |
| `max_uses` | integer | NULL | — | CHECK: > 0 |
| `uses_count` | integer | NULL | `0` | CHECK: >= 0 |
| `expires_at` | timestamptz | NULL | — | |
| `created_at` | timestamptz | NULL | `now()` | |

**Indexes:** `idx_invites_code`, `idx_invites_expires`, `idx_invites_session`, `idx_session_invites_code`, `idx_session_invites_expired` (partial: NOT NULL), `idx_session_invites_session_id`

**RLS Policies:**
- SELECT: everyone (by code); host of the session
- INSERT/UPDATE/DELETE: service_role only

---

### `session_invited_roblox`
Roblox users explicitly invited to a session (by Roblox user ID, before they have an app account). RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `session_id` | uuid | NOT NULL | — | PK, FK → `sessions.id` |
| `roblox_user_id` | bigint | NOT NULL | — | PK |
| `created_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_session_invited_roblox_session`, `idx_session_invited_roblox_roblox_user`

**RLS Policies:** service_role only for all operations

---

### `platforms`
Supported auth platforms (gaming and social). RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | NOT NULL | — | PK (e.g., `'roblox'`, `'google'`, `'apple'`) |
| `name` | text | NOT NULL | — | |
| `icon_url` | text | NULL | — | |
| `deep_link_scheme` | text | NULL | — | |
| `created_at` | timestamptz | NULL | `now()` | |

**Current platforms:**
- `roblox` — Roblox gaming platform (primary)
- `google` — Google OAuth (Google-first sign-up support)
- `apple` — Apple Sign In

**RLS Policies:**
- SELECT: everyone (public)
- INSERT/UPDATE/DELETE: service_role only

---

### `user_platforms`
User connections to external platforms, including OAuth tokens. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `user_id` | uuid | NOT NULL | — | PK, FK → `app_users.id` |
| `platform_id` | text | NOT NULL | — | PK, FK → `platforms.id` |
| `platform_user_id` | text | NOT NULL | — | UNIQUE with platform_id |
| `platform_username` | text | NULL | — | |
| `platform_display_name` | text | NULL | — | |
| `platform_avatar_url` | text | NULL | — | |
| `is_primary` | boolean | NULL | `false` | |
| `verified_at` | timestamptz | NULL | — | |
| `roblox_access_token_enc` | text | NULL | — | Encrypted OAuth access token |
| `roblox_refresh_token_enc` | text | NULL | — | Encrypted OAuth refresh token |
| `roblox_token_expires_at` | timestamptz | NULL | — | |
| `roblox_scope` | text | NULL | — | |
| `created_at` | timestamptz | NULL | `now()` | |
| `updated_at` | timestamptz | NULL | `now()` | |

**Indexes:** `idx_user_platforms_user_id`, `idx_user_platforms_platform_user`, `idx_user_platforms_roblox_token_expiry` (partial: platform_id = 'roblox')

**RLS Policies:**
- SELECT: everyone (public platform info); own platforms
- INSERT/UPDATE/DELETE: service_role only

---

### `friendships`
Friend relationships between app users. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `friend_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `initiated_by` | uuid | NOT NULL | — | FK → `app_users.id` |
| `status` | text | NOT NULL | `'pending'` | CHECK: `pending`, `accepted`, `blocked` |
| `created_at` | timestamptz | NULL | `now()` | |
| `accepted_at` | timestamptz | NULL | — | |
| `updated_at` | timestamptz | NULL | `now()` | |

**Constraints:** UNIQUE `(user_id, friend_id)`

**Indexes:** `idx_friendships_user_status`, `idx_friendships_friend_status`, `idx_friendships_pending` (partial: status = 'pending')

**RLS Policies:**
- SELECT (authenticated): own friendships (user_id or friend_id = auth.uid())

---

### `roblox_friends_cache`
Per-user blob cache of Roblox friends list. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `user_id` | uuid | NOT NULL | — | PK, FK → `app_users.id` |
| `roblox_user_id` | bigint | NOT NULL | — | |
| `friends_json` | jsonb | NOT NULL | `'[]'` | Full friends array from Roblox API |
| `etag` | text | NULL | — | |
| `fetched_at` | timestamptz | NOT NULL | — | |
| `expires_at` | timestamptz | NOT NULL | — | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_roblox_friends_cache_expires_at`

**RLS Policies:**
- SELECT: own cache (auth.uid() = user_id)
- INSERT/UPDATE/DELETE: service_role only

---

### `roblox_friends_cache_legacy`
Legacy row-per-friend cache (superseded by `roblox_friends_cache`). RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | bigint | NOT NULL | IDENTITY ALWAYS | PK |
| `user_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `roblox_friend_user_id` | text | NOT NULL | — | |
| `roblox_friend_username` | text | NULL | — | |
| `roblox_friend_display_name` | text | NULL | — | |
| `synced_at` | timestamptz | NOT NULL | `now()` | |

**Constraints:** UNIQUE `(user_id, roblox_friend_user_id)`

**Indexes:** `idx_roblox_friends_cache_user_synced`, `idx_roblox_friends_cache_roblox_user_id`

**RLS Policies:**
- SELECT (authenticated): own cache

---

### `roblox_experience_cache`
Cached metadata for Roblox experiences. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | bigint | NOT NULL | sequence | PK |
| `platform_key` | text | NOT NULL | `'roblox'` | |
| `url` | text | NOT NULL | — | UNIQUE |
| `place_id` | text | NOT NULL | — | |
| `universe_id` | text | NULL | — | |
| `name` | text | NULL | — | |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_roblox_experience_cache_place_id`, `idx_roblox_experience_cache_updated_at`

**RLS Policies:**
- SELECT: everyone (public)
- INSERT/UPDATE/DELETE: service_role only

---

### `user_favorites_cache`
Cached Roblox favorites per user. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `user_id` | uuid | NOT NULL | — | PK |
| `favorites_json` | jsonb | NOT NULL | `'[]'` | |
| `etag` | text | NOT NULL | — | |
| `cached_at` | timestamptz | NOT NULL | `now()` | |
| `expires_at` | timestamptz | NOT NULL | — | |

**Indexes:** `idx_user_favorites_cache_expires_at`

**RLS Policies:**
- SELECT: own cache (auth.uid() = user_id)
- INSERT/UPDATE/DELETE: service_role only

---

### `user_push_tokens`
Expo push notification tokens. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `expo_push_token` | text | NOT NULL | — | UNIQUE with user_id |
| `device_id` | text | NULL | — | |
| `platform` | text | NULL | — | CHECK: `ios`, `android`, `web` |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `last_seen_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_user_push_tokens_user_id`, `idx_user_push_tokens_last_seen`

**RLS Policies:** service_role only for all operations

---

### `user_stats`
Aggregate statistics per user. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `user_id` | uuid | NOT NULL | — | PK, FK → `app_users.id` |
| `sessions_hosted` | integer | NOT NULL | `0` | |
| `sessions_joined` | integer | NOT NULL | `0` | |
| `streak_days` | integer | NOT NULL | `0` | |
| `last_active_date` | date | NULL | — | |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_user_stats_updated_at`

**RLS Policies:** service_role only for all operations

---

### `user_achievements`
Achievements unlocked by users. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `code` | text | NOT NULL | — | Achievement identifier |
| `unlocked_at` | timestamptz | NOT NULL | `now()` | |

**Constraints:** UNIQUE `(user_id, code)`

**Indexes:** `idx_user_achievements_user_id`

**RLS Policies:** service_role only for all operations

---

### `user_rankings`
Current competitive rankings per user. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `user_id` | uuid | NOT NULL | — | PK, FK → `app_users.id` |
| `rating` | integer | NOT NULL | `1000` | ELO-style rating |
| `wins` | integer | NOT NULL | `0` | |
| `losses` | integer | NOT NULL | `0` | |
| `last_ranked_match_at` | timestamptz | NULL | — | |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_user_rankings_rating_desc`

**RLS Policies:** service_role only for all operations

---

### `match_results`
Results for ranked matches. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `session_id` | uuid | NOT NULL | — | FK → `sessions.id`, UNIQUE |
| `winner_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `rating_delta` | integer | NOT NULL | — | Rating change for winner |
| `created_at` | timestamptz | NOT NULL | `now()` | |

**RLS Policies:** service_role only for all operations

---

### `seasons`
Competitive seasons. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `season_number` | integer | NOT NULL | — | UNIQUE |
| `start_date` | timestamptz | NOT NULL | — | |
| `end_date` | timestamptz | NOT NULL | — | |
| `is_active` | boolean | NOT NULL | `false` | |
| `created_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_seasons_active` (partial: is_active = true)

**RLS Policies:** service_role only for all operations

---

### `season_rankings`
Historical rankings snapshot at end of each season. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `season_id` | uuid | NOT NULL | — | FK → `seasons.id` |
| `user_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `final_rating` | integer | NOT NULL | — | |
| `created_at` | timestamptz | NOT NULL | `now()` | |

**Constraints:** UNIQUE `(season_id, user_id)`

**Indexes:** `idx_season_rankings_final_rating_desc`

**RLS Policies:** service_role only for all operations

---

### `account_deletion_requests`
User account deletion requests with lifecycle tracking. RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | uuid | NOT NULL | — | FK → `app_users.id` |
| `status` | text | NOT NULL | `'PENDING'` | CHECK: `PENDING`, `COMPLETED`, `CANCELED`, `FAILED` |
| `initiator` | text | NOT NULL | `'IN_APP'` | CHECK: `IN_APP`, `WEB` |
| `reason` | text | NULL | — | |
| `requested_at` | timestamptz | NOT NULL | `now()` | |
| `scheduled_purge_at` | timestamptz | NOT NULL | — | |
| `completed_at` | timestamptz | NULL | — | |
| `canceled_at` | timestamptz | NULL | — | |
| `failed_at` | timestamptz | NULL | — | |
| `failure_reason` | text | NULL | — | |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Constraints:** UNIQUE `(user_id)` WHERE status = 'PENDING' (one pending request per user)

**Indexes:** `idx_account_deletion_requests_user_id`, `idx_account_deletion_requests_requested_at`, `idx_account_deletion_requests_status_scheduled`

**RLS Policies:**
- SELECT: own request (auth.uid() = user_id)
- INSERT/UPDATE/DELETE: service_role only

---

### `reports`
In-app safety reports for child safety compliance (COPPA, Google Play Child Safety). RLS enabled.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `reporter_id` | uuid | NOT NULL | — | FK → `app_users.id` ON DELETE CASCADE |
| `target_user_id` | uuid | NULL | — | FK → `app_users.id` ON DELETE SET NULL (who is reported) |
| `target_session_id` | uuid | NULL | — | FK → `sessions.id` ON DELETE SET NULL (what session is reported) |
| `category` | report_category | NOT NULL | — | Type of violation (CSAM, grooming, harassment, etc.) |
| `description` | text | NOT NULL | — | CHECK: non-empty trimmed text |
| `status` | report_status | NOT NULL | `'OPEN'` | Report lifecycle (OPEN → UNDER_REVIEW → CLOSED or ESCALATED) |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Constraints:** `target_user_id` OR `target_session_id` must be set; reporter cannot report themselves

**Indexes:** `idx_reports_reporter_created_at`, `idx_reports_status_created_at`, `idx_reports_target_user` (partial: NOT NULL), `idx_reports_target_session` (partial: NOT NULL)

**Triggers:** `update_reports_updated_at` on UPDATE

**RLS Policies:**
- INSERT: authenticated users can submit reports (`reporter_id = auth.uid()`)
- SELECT: authenticated users can see own reports
- UPDATE/DELETE: service_role only (admin moderation)

---

## Migrations

Applied in order (earliest first). Core migrations establish schema; RLS migrations apply authorization policies.

| Version | Name | Purpose |
|---------|------|---------|
| 20260207172512 | 001_core_schema | Initial schema: users, sessions, games, friends, leaderboards |
| 20260211135258 | complete_rls_policies | Add comprehensive RLS policies for data isolation |
| 20260211135359 | enable_rls_policies | Enable RLS on all tables |
| 20260211223803 | add_thumbnail_to_games | Cache game thumbnails |
| 20260214101822 | hybrid_friends_schema | Hybrid friends caching (blob + legacy row-per-friend) |
| 20260214131531 | 010_enforce_friends_sessions | Add friend constraints to sessions |
| 20260214135005 | 008_handoff_presence | Add handoff tracking for session participants |
| 20260214135021 | 011_sessions_schema_contract | Formalize session schema contracts |
| 20260214140159 | 012_add_avatar_cache_to_app_users | Cache user avatar URLs from linked platforms |
| 20260214142007 | 013_align_user_platforms_fk_to_app_users | Migrate user_platforms FK to app_users (from auth.users) |
| 20260214181902 | create_user_favorites_cache | Cache user favorites with ETags |
| 20260214192508 | add_roblox_friends_cache_and_session_invited_roblox | Add blob cache for Roblox friends, invited Roblox users table |
| 20260214205053 | add_user_push_tokens | Expo push notification token storage |
| 20260216114056 | user_stats_achievements | User aggregate stats and achievement tracking |
| 20260216135712 | ranked_sessions_and_ratings | Competitive ranking system (ELO) |
| 20260216144120 | seasons_and_match_history | Seasonal rankings and match history |
| 20260217203258 | account_deletion | Account deletion request tracking |
| 20260217221455 | rls_account_deletion_experience_favorites | RLS policies for deletion, reports, and favorites |
| 20260220154000 | create_reports_and_safety_rls | Safety reporting (COPPA/child safety compliance) |
| 20260220190000 | add_sessions_archival_column_and_filter_rpc | Session archival support |
| 20260223174000 | track_roblox_experience_cache | Improved experience cache tracking |
| 20260223184500 | add_games_thumbnail_cached_at | Track when game thumbnails were cached |
| 20260227193000 | google_first_users | Allow Google sign-up without Roblox; make Roblox fields nullable |
| 20260227211500 | link_platform_identity_tx | Platform identity linking transaction support |
| 20260228120000 | add_apple_platform | Add Apple Sign In as supported platform |
