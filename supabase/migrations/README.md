# Supabase Migrations

This directory contains all database migrations for the LagaLaga platform.

## Migration Files

### 001_core_schema.sql (Epic 1)
**Status:** ✅ Applied in Epic 1
**Purpose:** Core database schema

Creates:
- `games` table - Roblox game information
- `sessions` table - Gaming sessions
- `session_participants` table - Session membership
- `session_invites` table - Invite codes
- `user_platforms` table - User platform connections
- ENUMs, indexes, triggers, and constraints

### 002_enable_rls_policies.sql (Epic 7)
**Status:** ⏳ Pending Application
**Purpose:** Row Level Security policies

Implements:
- RLS enabled on all 5 tables
- 31 security policies
- Service role access patterns
- User permission enforcement

### verify_rls.sql
**Purpose:** Verification script for RLS migration

Use after applying `002_enable_rls_policies.sql` to verify:
- RLS is enabled on all tables
- All policies are created
- Policy counts match expected
- Service role policies exist

---

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the contents of the migration file
5. Paste into the SQL editor
6. Click **Run** or press `Ctrl+Enter` / `Cmd+Enter`
7. Verify success (no errors in output)

**For RLS Migration:**
```sql
-- Step 1: Copy and run 002_enable_rls_policies.sql
-- Step 2: Copy and run verify_rls.sql to verify
```

---

### Option 2: Supabase CLI

**Prerequisites:**
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref <your-project-ref>
```

**Apply Migration:**
```bash
# From project root
cd /Users/family/dev/lagalaga

# Apply all pending migrations
supabase db push

# Or apply specific migration
supabase db execute --file supabase/migrations/002_enable_rls_policies.sql
```

**Verify:**
```bash
# Run verification script
supabase db execute --file supabase/migrations/verify_rls.sql
```

---

### Option 3: Direct PostgreSQL Connection

**Prerequisites:**
- PostgreSQL client (`psql`) installed
- Database connection string from Supabase dashboard

**Apply Migration:**
```bash
# Connect to database
psql "<your-connection-string>"

# Run migration
\i supabase/migrations/002_enable_rls_policies.sql

# Verify
\i supabase/migrations/verify_rls.sql

# Exit
\q
```

**Get Connection String:**
1. Go to Supabase Dashboard
2. Settings → Database
3. Copy "Connection string" under "Connection pooling"
4. Replace `[YOUR-PASSWORD]` with your database password

---

## Migration Status Tracking

| Migration | Epic | Status | Applied Date | Notes |
|-----------|------|--------|--------------|-------|
| 001_core_schema | Epic 1 | ✅ Applied | 2026-02-06 | Core schema created |
| 002_enable_rls_policies | Epic 7 | ⏳ Pending | - | Apply after Epic 7 completion |

---

## Best Practices

### Before Applying a Migration

1. **Backup Your Database** (Production)
   ```bash
   # Using Supabase Dashboard
   # Settings → Database → Backups → Create Backup
   ```

2. **Test in Development First**
   - Apply migration to dev/staging environment
   - Run verification script
   - Test application functionality
   - Only then apply to production

3. **Read the Migration File**
   - Understand what changes will be made
   - Check for any breaking changes
   - Review comments and notes

### After Applying a Migration

1. **Run Verification Script**
   ```sql
   -- For RLS migration
   \i supabase/migrations/verify_rls.sql
   ```

2. **Test Application**
   - Verify backend API still works
   - Test frontend functionality
   - Check for any errors in logs

3. **Monitor Performance**
   - Watch for slow queries
   - Check RLS policy performance
   - Monitor error rates

4. **Update Status**
   - Mark migration as applied in tracking table above
   - Document any issues encountered
   - Note date and who applied it

---

## Rollback Procedures

### Rollback RLS Migration

If issues arise after applying `002_enable_rls_policies.sql`:

**Option 1: Disable RLS (Emergency)**
```sql
ALTER TABLE games DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_platforms DISABLE ROW LEVEL SECURITY;
```

**Option 2: Drop All Policies**
```sql
-- List all policies to drop
SELECT 'DROP POLICY "' || policyname || '" ON ' || tablename || ';'
FROM pg_policies
WHERE schemaname = 'public';

-- Copy output and execute
```

**Option 3: Restore from Backup**
```bash
# Using Supabase Dashboard
# Settings → Database → Backups → Restore
```

---

## Troubleshooting

### Migration Fails with Permission Error
**Issue:** `ERROR: permission denied for table <table_name>`
**Solution:**
- Ensure you're connected as the database owner
- Or use the service role key in Supabase Dashboard

### Migration Runs but Verification Fails
**Issue:** Verification script shows mismatches
**Solution:**
1. Check which policies are missing
   ```sql
   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
   ```
2. Re-run specific policy creation from migration file
3. Run verification again

### Backend API Stops Working After RLS
**Issue:** Backend returns empty results or errors
**Solution:**
1. Verify backend is using service role key:
   ```typescript
   // Check backend/src/config/supabase.ts
   // Should use SUPABASE_SERVICE_ROLE_KEY
   ```
2. Temporarily disable RLS to confirm:
   ```sql
   ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
   ```
3. If backend works with RLS disabled, check policies
4. Re-enable RLS and fix backend code

### Slow Queries After RLS
**Issue:** Queries taking longer than before
**Solution:**
1. Identify slow queries:
   ```sql
   SELECT query, mean_exec_time FROM pg_stat_statements
   ORDER BY mean_exec_time DESC LIMIT 10;
   ```
2. Add indexes on columns used in RLS policies
3. Consider caching in backend
4. Simplify complex policies if needed

---

## Getting Help

### Documentation
- Epic 7 Testing Guide: `docs/EPIC7_RLS_TESTING_GUIDE.md`
- Epic 7 Completion Summary: `docs/EPIC7_COMPLETION_SUMMARY.md`
- Supabase RLS Docs: https://supabase.com/docs/guides/auth/row-level-security

### Support
- Check application logs for errors
- Review Supabase Dashboard → Logs
- Test with verification script
- Consult Epic 7 documentation

---

## Future Migrations

When adding new migrations:

1. **Naming Convention:** `XXX_description.sql`
   - XXX = sequential number (003, 004, etc.)
   - description = brief summary (snake_case)

2. **Include:**
   - Header comment with Epic/Story reference
   - Clear description of changes
   - Verification queries
   - Rollback instructions
   - Notes and considerations

3. **Test:**
   - Apply to dev environment first
   - Create verification script
   - Test rollback procedure
   - Document in README

4. **Update:**
   - Add to migration status table above
   - Update relevant Epic documentation
   - Notify team of changes

---

## Migration Checklist

Before applying any migration:

- [ ] Backup database (if production)
- [ ] Read migration file completely
- [ ] Understand all changes being made
- [ ] Test in dev/staging first
- [ ] Have rollback plan ready
- [ ] Notify team (if production)

After applying migration:

- [ ] Run verification script
- [ ] Check for errors in output
- [ ] Test backend API
- [ ] Test frontend app
- [ ] Monitor logs for issues
- [ ] Update migration status table
- [ ] Document any issues

---

## Notes

- Always use **service role key** when applying migrations via Supabase Dashboard
- **Never commit** `.env` files with real credentials
- **Test thoroughly** in dev before applying to production
- **Keep backups** before major migrations (especially RLS)
- **Monitor performance** after applying migrations
