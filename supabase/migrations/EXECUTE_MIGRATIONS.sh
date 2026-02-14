#!/bin/bash

# LagaLaga Database Migration Script for On-Premise Deployment
# This script executes all migrations in the exact order they were run on Supabase

set -e  # Exit on error

# Database connection parameters
# Override these with environment variables if needed
: ${DB_HOST:="localhost"}
: ${DB_PORT:="5432"}
: ${DB_NAME:="lagalaga"}
: ${DB_USER:="postgres"}
: ${DB_PASSWORD:=""}

echo "=========================================="
echo "LagaLaga Database Migration"
echo "=========================================="
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "=========================================="
echo ""

# Build connection string
if [ -n "$DB_PASSWORD" ]; then
  CONN="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
else
  CONN="postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
fi

# Function to execute a migration
execute_migration() {
  local file=$1
  local description=$2

  echo ">>> Executing: $description"
  echo "    File: $file"

  psql "$CONN" -f "$file" -v ON_ERROR_STOP=1

  if [ $? -eq 0 ]; then
    echo "✅  Success"
  else
    echo "❌  Failed"
    exit 1
  fi
  echo ""
}

cd "$(dirname "$0")"

echo "Starting migrations..."
echo ""

# Migration 1: Core schema (games, sessions, participants, invites, platforms, user_platforms)
execute_migration \
  "20260207172512_001_core_schema.sql" \
  "1/11: Core schema (games, sessions, platforms)"

# Migration 1.5: Create app_users table
execute_migration \
  "20260211000000_create_app_users.sql" \
  "1.5/11: Create app_users table"

# Migration 2: Complete RLS policies (platforms, app_users)
execute_migration \
  "004_complete_rls_policies.sql" \
  "2/11: Complete RLS policies"

# Migration 3: Enable RLS policies (games, sessions, participants, invites, user_platforms)
execute_migration \
  "002_enable_rls_policies.sql" \
  "3/11: Enable RLS policies"

# Migration 4: Add thumbnail to games (idempotent, already in core schema)
execute_migration \
  "20260211223803_add_thumbnail_to_games.sql" \
  "4/11: Add thumbnail to games"

# IMPORTANT: Add roblox_experience_cache (exists in DB but not in migration history)
execute_migration \
  "007_add_roblox_experience_cache.sql" \
  "4.5/11: Add Roblox experience cache (manual table)"

# Migration 5: Hybrid friends schema
execute_migration \
  "009_hybrid_friends_schema.sql" \
  "5/11: Hybrid friends schema"

# Migration 6: Enforce friends sessions
execute_migration \
  "010_enforce_friends_sessions.sql" \
  "6/11: Enforce friends-only sessions"

# Migration 7: Handoff presence
execute_migration \
  "008_handoff_presence.sql" \
  "7/11: Handoff presence tracking"

# Migration 8: Sessions schema contract (FK migration to app_users)
execute_migration \
  "011_sessions_schema_contract.sql" \
  "8/11: Sessions schema contract"

# Migration 9: Avatar cache
execute_migration \
  "012_add_avatar_cache_to_app_users.sql" \
  "9/11: Add avatar cache to app_users"

# Migration 10: Align user platforms FK
execute_migration \
  "013_align_user_platforms_fk_to_app_users.sql" \
  "10/11: Align user_platforms FK to app_users"

echo "=========================================="
echo "All migrations completed successfully!"
echo "=========================================="
echo ""
echo "Run verification queries:"
echo "  psql \"$CONN\" -f verify_schema.sql"
echo ""
