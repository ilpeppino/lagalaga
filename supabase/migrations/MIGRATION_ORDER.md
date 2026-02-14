# Migration Order for On-Premise Database

This document maps the actual execution order from Supabase to help you replicate the database schema on-prem.

## Complete Migration History from Supabase

These migrations were executed on Supabase in this exact order:

| # | Timestamp | Migration Name | Local File | Notes |
|---|-----------|----------------|------------|-------|
| 1 | 20260207172512 | 001_core_schema | ✅ `20260207172512_001_core_schema.sql` | Includes thumbnail_url, references auth.users |
| 2 | 20260211135258 | complete_rls_policies | ⚠️ `004_complete_rls_policies.sql` | Enables RLS on all tables including app_users |
| 3 | 20260211135359 | enable_rls_policies | ⚠️ `002_enable_rls_policies.sql` | Creates RLS policies (drop + recreate) |
| 4 | 20260211223803 | add_thumbnail_to_games | ✅ `20260211223803_add_thumbnail_to_games.sql` | Adds thumbnail_url (already in core schema, idempotent) |
| 5 | 20260214101822 | hybrid_friends_schema | ⚠️ `009_hybrid_friends_schema.sql` | Creates friendships + roblox_friends_cache |
| 6 | 20260214131531 | 010_enforce_friends_sessions | ✅ `010_enforce_friends_sessions.sql` | Updates list_sessions_optimized function |
| 7 | 20260214135005 | 008_handoff_presence | ⚠️ `008_handoff_presence.sql` | Adds handoff_state + OAuth token fields |
| 8 | 20260214135021 | 011_sessions_schema_contract | ✅ `011_sessions_schema_contract.sql` | Migrates FKs from auth.users to app_users |
| 9 | 20260214140159 | 012_add_avatar_cache_to_app_users | ✅ `012_add_avatar_cache_to_app_users.sql` | Adds avatar cache columns |
| 10 | 20260214142007 | 013_align_user_platforms_fk_to_app_users | ✅ `013_align_user_platforms_fk_to_app_users.sql` | Migrates user_platforms FK to app_users |

## Important Notes

1. **app_users table**: Created in migration #2 (complete_rls_policies), NOT in the core schema
2. **thumbnail_url**: Already included in core schema (migration #1), migration #4 is idempotent
3. **FK Migration**: Migrations #8 and #10 migrate foreign keys from `auth.users` to `app_users`
4. **roblox_experience_cache**: NOT in any Supabase migration (see local-only files below)

## Local Files NOT Executed on Supabase

These files exist locally but were NEVER executed on Supabase:

- `003_align_session_fks_to_app_users.sql` - Superseded by 011_sessions_schema_contract
- `005_add_performance_indexes.sql` - Performance optimization (not applied)
- `005_add_performance_indexes_rollback.sql` - Rollback file
- `006_optimize_session_listing.sql` - Session listing optimization (not applied)
- `006_optimize_session_listing_rollback.sql` - Rollback file
- `007_add_roblox_experience_cache.sql` - **Table exists in DB but not via migration!**
- `009_verify_friends_schema.sql` - Verification script (not a migration)
- `verify_rls.sql` - Verification script (not a migration)

⚠️ **CRITICAL**: The `roblox_experience_cache` table exists in your Supabase database but is NOT in the migration history. It was likely created manually or via a migration that was deleted. You'll need to include `007_add_roblox_experience_cache.sql` in your on-prem setup.

## Recommended Migration Order for On-Prem

To replicate the exact Supabase schema on-prem, execute in this order:

```bash
# 1. Core schema
psql -f 20260207172512_001_core_schema.sql

# 2. Complete RLS policies (executed as "complete_rls_policies" on Supabase)
psql -f 004_complete_rls_policies.sql

# 3. Enable RLS (executed as "enable_rls_policies" on Supabase)
psql -f 002_enable_rls_policies.sql

# 4. Add thumbnail to games
psql -f 20260211223803_add_thumbnail_to_games.sql

# 5. Hybrid friends schema
psql -f 009_hybrid_friends_schema.sql

# 6. Enforce friends sessions
psql -f 010_enforce_friends_sessions.sql

# 7. Handoff presence
psql -f 008_handoff_presence.sql

# 8. Sessions schema contract
psql -f 011_sessions_schema_contract.sql

# 9. Avatar cache
psql -f 012_add_avatar_cache_to_app_users.sql

# 10. Align user platforms FK
psql -f 013_align_user_platforms_fk_to_app_users.sql
```

## Notes

1. **Timestamp vs Sequential Numbers**: Supabase uses timestamps (YYYYMMDDHHMMSS format), while local files use sequential numbers (001, 002, etc.). The timestamp format is recommended for team environments to avoid conflicts.

2. **Missing Migrations**: Some local migrations (003, 005, 006, 007) were never executed on Supabase. These might be:
   - Abandoned changes
   - Migrations that were squashed into others
   - Draft migrations that weren't needed

3. **Order Discrepancy**: The execution order on Supabase differs from the local file numbering. For example, `004_complete_rls_policies.sql` was executed BEFORE `002_enable_rls_policies.sql`.

4. **Verification Scripts**: Files like `verify_rls.sql` and `009_verify_friends_schema.sql` are not migrations but verification scripts for testing.

## Schema Verification

After running all migrations, verify the schema matches Supabase:

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should include:
-- - app_users
-- - friendships
-- - games
-- - platforms
-- - roblox_experience_cache
-- - roblox_friends_cache
-- - session_invites
-- - session_participants
-- - sessions
-- - user_platforms

-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

## Next Steps

1. Review the migrations in the recommended order
2. Create a fresh PostgreSQL database
3. Execute migrations in order
4. Verify schema matches Supabase using the verification queries
5. Test your application against the new on-prem database
6. Consider consolidating/renaming migrations to match the execution order
