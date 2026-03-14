/**
 * RLS Audit Test
 *
 * Parses all SQL migration files in chronological order. For each sensitive
 * table, tracks net-active policies that grant USING (true) SELECT access
 * to non-service-role principals, and fails if any remain after all migrations.
 *
 * This prevents regression of the user_platforms token-exposure incident
 * (see migration 20260314140000_fix_user_platforms_rls.sql).
 *
 * Runs in CI without a database connection.
 */

import { describe, expect, it } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Tables that must never have a net-active public-readable USING (true) SELECT
 * policy (policies scoped only to service_role are permitted).
 */
const SENSITIVE_TABLES = ['user_platforms'];

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations');

function readMigrationsChronologically(): { file: string; sql: string }[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      file: f,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'),
    }));
}

/**
 * Extract names of CREATE POLICY statements that grant USING (true) on `table`
 * to any principal OTHER than service_role (those are safe).
 */
function extractPublicBroadPolicies(sql: string, table: string): string[] {
  const names: string[] = [];
  const re = new RegExp(
    `CREATE\\s+POLICY\\s+"([^"]+)"[^;]+ON\\s+${table}\\b[^;]+USING\\s*\\(\\s*true\\s*\\)`,
    'gi'
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const block = m[0];
    // Skip policies explicitly scoped to service_role only
    if (/TO\s+service_role/i.test(block) && !/TO\s+(authenticated|public|anon)/i.test(block)) {
      continue;
    }
    names.push(m[1].toLowerCase());
  }
  return names;
}

function extractDroppedPolicies(sql: string, table: string): string[] {
  const names: string[] = [];
  const re = new RegExp(
    `DROP\\s+POLICY(?:\\s+IF\\s+EXISTS)?\\s+"([^"]+)"\\s+ON\\s+${table}\\b`,
    'gi'
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    names.push(m[1].toLowerCase());
  }
  return names;
}

describe('RLS audit — no net-active public USING (true) SELECT on credential tables', () => {
  const migrations = readMigrationsChronologically();

  it('migration directory contains files', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  for (const table of SENSITIVE_TABLES) {
    it(`no net-active public USING (true) SELECT policy on ${table} after all migrations`, () => {
      const active = new Set<string>();

      for (const { sql } of migrations) {
        for (const name of extractPublicBroadPolicies(sql, table)) {
          active.add(name);
        }
        for (const name of extractDroppedPolicies(sql, table)) {
          active.delete(name);
        }
      }

      expect([...active]).toEqual([]);
    });
  }
});
