# Apply Hybrid Friends Migration

This document provides step-by-step instructions to apply the hybrid friends database schema to your Supabase database.

## Files Created

1. **Migration:** `supabase/migrations/009_hybrid_friends_schema.sql`
   - Creates `roblox_friends_cache` table
   - Creates `friendships` table
   - Adds constraints, indexes, and RLS policies

2. **Verification:** `supabase/migrations/009_verify_friends_schema.sql`
   - Verifies tables, constraints, indexes, RLS
   - Tests canonical ordering constraint
   - Provides summary report

## Prerequisites

- Access to your Supabase project dashboard
- Database permissions (service role recommended)

---

## Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query** button

---

## Step 2: Apply Migration

### Copy the Migration File

Open `supabase/migrations/009_hybrid_friends_schema.sql` and copy its entire contents.

### Paste and Run

1. Paste the SQL into the SQL Editor
2. Click **Run** or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows/Linux)
3. Wait for execution to complete

### Expected Output

You should see success messages like:
```
SUCCESS. No rows returned
```

If you see any errors, **STOP** and review the error message before proceeding.

---

## Step 3: Verify Migration

### Copy the Verification Script

Open `supabase/migrations/009_verify_friends_schema.sql` and copy its entire contents.

### Paste and Run

1. In SQL Editor, click **New Query**
2. Paste the verification SQL
3. Click **Run** or press `Cmd+Enter` / `Ctrl+Enter`

### Expected Output

You should see multiple ✅ checkmarks in the Messages/Notices panel:

```
NOTICE: ✅ Table roblox_friends_cache exists
NOTICE: ✅ Table friendships exists
NOTICE: ✅ Constraint uq_roblox_friends_cache_user_friend exists
NOTICE: ✅ Constraint chk_friendships_canonical_order exists
NOTICE: ✅ Constraint chk_friendships_status exists
NOTICE: ✅ Constraint uq_friendships_user_friend exists
NOTICE: ✅ Index idx_roblox_friends_cache_roblox_user_id exists
NOTICE: ✅ Index idx_roblox_friends_cache_user_synced exists
NOTICE: ✅ Index idx_friendships_user_status exists
NOTICE: ✅ Index idx_friendships_friend_status exists
NOTICE: ✅ Index idx_friendships_pending exists
NOTICE: ✅ RLS enabled on roblox_friends_cache
NOTICE: ✅ 1 RLS policies on roblox_friends_cache
NOTICE: ✅ RLS enabled on friendships
NOTICE: ✅ 1 RLS policies on friendships
NOTICE: ✅ Canonical ordering constraint working
```

The final result table should show:
```
status                          | tables_created | indexes_created | rls_policies_created
Migration Verification Complete | 2              | 7               | 2
```

---

## Step 4: Verify in Table Editor

### Check Tables Exist

1. Navigate to **Table Editor** in the left sidebar
2. Confirm you see two new tables:
   - `roblox_friends_cache`
   - `friendships`

### Inspect Schema

Click on each table and verify columns:

**roblox_friends_cache:**
- `id` (bigint, primary key, auto-increment)
- `user_id` (uuid, foreign key to app_users)
- `roblox_friend_user_id` (text)
- `roblox_friend_username` (text, nullable)
- `roblox_friend_display_name` (text, nullable)
- `synced_at` (timestamptz, default now())

**friendships:**
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key to app_users)
- `friend_id` (uuid, foreign key to app_users)
- `status` (text, default 'pending')
- `initiated_by` (uuid, foreign key to app_users)
- `created_at` (timestamptz, default now())
- `accepted_at` (timestamptz, nullable)
- `updated_at` (timestamptz, default now())

---

## Step 5: Test Basic Operations (Optional)

### Test Canonical Ordering Constraint

Try inserting a friendship with incorrect ordering (should fail):

```sql
-- This should FAIL with check constraint violation
INSERT INTO friendships (user_id, friend_id, initiated_by)
VALUES (
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
);
```

Expected: Error message about `chk_friendships_canonical_order`

### Test Valid Insert (Clean Up After)

```sql
-- Get a real user ID from your database
SELECT id FROM app_users LIMIT 2;

-- Use two real user IDs (replace UUIDs below)
-- Ensure user_id_1 < user_id_2 lexicographically
INSERT INTO friendships (user_id, friend_id, initiated_by, status)
VALUES (
  '<smaller-uuid>'::uuid,
  '<larger-uuid>'::uuid,
  '<smaller-uuid>'::uuid,
  'pending'
);

-- Verify it inserted
SELECT * FROM friendships;

-- Clean up test data
DELETE FROM friendships WHERE status = 'pending';
```

---

## Rollback (If Needed)

If something goes wrong and you need to rollback:

```sql
-- Drop tables (this will also drop all data, constraints, and indexes)
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.roblox_friends_cache CASCADE;
```

---

## Troubleshooting

### Error: "relation already exists"

**Solution:** Tables may already exist. Check Table Editor or run:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('roblox_friends_cache', 'friendships');
```

If tables exist, you can either:
- Drop them and re-run migration (see Rollback section)
- Skip this migration if already applied

### Error: "permission denied"

**Solution:** Ensure you're using the service role key or have sufficient permissions. In the SQL Editor, check that you're authenticated with the right credentials.

### Verification Shows Missing Items

**Solution:** Re-run the migration SQL. The migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so it's safe to run multiple times.

---

## Next Steps

After successful migration:

1. ✅ Mark migration as applied:
   - Update `supabase/migrations/README.md`
   - Add entry to migration status table

2. 🔨 Begin backend implementation:
   - PR 2: Roblox Friends Sync Service
   - PR 3: LagaLaga Friendship CRUD
   - See `docs/features/hybrid-friends.md` for full plan

3. 📝 Update project documentation:
   - Document new tables in schema docs
   - Update API documentation (when endpoints are built)

---

## Questions or Issues?

- Review the full implementation plan: `docs/features/hybrid-friends.md`
- Check migration README: `supabase/migrations/README.md`
- Review Supabase logs in Dashboard → Logs
