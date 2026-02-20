# Database Migration Guide

This guide walks you through running the database migration to add the `app_users` table and update the `sessions` table foreign key.

## Prerequisites

- Access to your Supabase project dashboard
- The database migration file: `backend/migrations/001_create_app_users.sql`

## Migration Steps

### 1. Access Supabase SQL Editor

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_ID
2. Click on the **SQL Editor** in the left sidebar
3. Click **New Query** to create a new SQL query

### 2. Run the Migration

Copy the contents of `backend/migrations/001_create_app_users.sql` and paste it into the SQL editor:

```sql
-- Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roblox_user_id VARCHAR(255) UNIQUE NOT NULL,
  roblox_username VARCHAR(100) NOT NULL,
  roblox_display_name VARCHAR(100),
  roblox_profile_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Create index on roblox_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_users_roblox_user_id ON app_users(roblox_user_id);

-- Add foreign key constraint to sessions table
-- Note: This assumes the sessions table already exists
ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_host_user
  FOREIGN KEY (host_user_id)
  REFERENCES app_users(id)
  ON DELETE CASCADE;

-- Add comment
COMMENT ON TABLE app_users IS 'Stores user accounts linked to Roblox OAuth';
```

### 3. Execute the Query

1. Click the **Run** button (or press `Ctrl+Enter` / `Cmd+Enter`)
2. Wait for the query to complete
3. You should see a success message in the Results panel

### 4. Verify the Migration

Run this query to verify the table was created successfully:

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'app_users'
ORDER BY ordinal_position;
```

You should see 7 columns:
- `id` (UUID)
- `roblox_user_id` (VARCHAR)
- `roblox_username` (VARCHAR)
- `roblox_display_name` (VARCHAR)
- `roblox_profile_url` (TEXT)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- `last_login_at` (TIMESTAMPTZ)

### 5. Verify Foreign Key Constraint

Run this query to verify the foreign key was added to the sessions table:

```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'sessions'
  AND tc.constraint_type = 'FOREIGN KEY';
```

You should see a constraint named `fk_sessions_host_user` linking `sessions.host_user_id` to `app_users.id`.

## Rollback (If Needed)

If you need to rollback the migration, run:

```sql
-- Remove foreign key constraint
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS fk_sessions_host_user;

-- Drop app_users table
DROP TABLE IF EXISTS app_users;
```

**Warning:** This will delete all user records. Only do this if you haven't yet deployed to production.

## Next Steps

After running the migration:

1. Update your backend `.env` file with real Supabase credentials
2. Register your Roblox OAuth app and update the OAuth credentials
3. Deploy the backend to your hosting provider
4. Update the app `.env` with the production API URL
5. Test the OAuth flow end-to-end

## Troubleshooting

### Error: relation "sessions" does not exist

If you get this error, it means the `sessions` table doesn't exist yet. You'll need to create it first. Check the `docs/runbook/supabase-sql-table.md` file for the sessions table schema.

### Error: column "host_user_id" does not exist

The sessions table needs to have a `host_user_id` column. Add it with:

```sql
ALTER TABLE sessions ADD COLUMN host_user_id UUID;
```

### Error: constraint "fk_sessions_host_user" already exists

The constraint was already added. You can skip this step or drop and recreate it:

```sql
ALTER TABLE sessions DROP CONSTRAINT fk_sessions_host_user;
-- Then re-run the ALTER TABLE ADD CONSTRAINT command
```
