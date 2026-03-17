import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export interface AppUser {
  id: string;
  robloxUserId: string | null;
  robloxUsername: string | null;
  robloxDisplayName: string | null;
  robloxProfileUrl: string | null;
  status: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  avatarHeadshotUrl: string | null;
  avatarCachedAt: string | null;
  authProvider?: 'ROBLOX' | 'APPLE' | 'GOOGLE' | null;
  appleSub?: string | null;
  appleEmail?: string | null;
  appleFullName?: string | null;
  appleEmailIsPrivate?: boolean | null;
  googleSub?: string | null;
  googleEmail?: string | null;
  googleFullName?: string | null;
  googleEmailVerified?: boolean | null;
}

export interface UpsertUserData {
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName?: string | null;
  robloxProfileUrl?: string | null;
  lastLoginAt: string;
  updatedAt: string;
}

export interface InsertUserData {
  robloxUserId?: string | null;
  robloxUsername?: string | null;
  robloxDisplayName?: string | null;
  robloxProfileUrl?: string | null;
  lastLoginAt: string;
  updatedAt: string;
}

type AppUserRow = {
  id: string;
  roblox_user_id: string | null;
  roblox_username: string | null;
  roblox_display_name: string | null;
  roblox_profile_url: string | null;
  status: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  token_version: number | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  avatar_headshot_url: string | null;
  avatar_cached_at: string | null;
  auth_provider?: 'ROBLOX' | 'APPLE' | 'GOOGLE' | null;
  apple_sub?: string | null;
  apple_email?: string | null;
  apple_full_name?: string | null;
  apple_email_is_private?: boolean | null;
  google_sub?: string | null;
  google_email?: string | null;
  google_full_name?: string | null;
  google_email_verified?: boolean | null;
};

const APP_USERS_BASE_SELECT = [
  'id',
  'roblox_user_id',
  'roblox_username',
  'roblox_display_name',
  'roblox_profile_url',
  'status',
  'token_version',
  'created_at',
  'updated_at',
  'last_login_at',
  'avatar_headshot_url',
  'avatar_cached_at',
  'auth_provider',
  'apple_sub',
  'apple_email',
  'apple_full_name',
  'apple_email_is_private',
  'google_sub',
  'google_email',
  'google_full_name',
  'google_email_verified',
] as const;

const APP_USER_COLUMN_MAP: Record<string, string> = {
  id: 'id',
  robloxUserId: 'roblox_user_id',
  robloxUsername: 'roblox_username',
  robloxDisplayName: 'roblox_display_name',
  robloxProfileUrl: 'roblox_profile_url',
  status: 'status',
  tokenVersion: 'token_version',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  lastLoginAt: 'last_login_at',
  avatarHeadshotUrl: 'avatar_headshot_url',
  avatarCachedAt: 'avatar_cached_at',
  authProvider: 'auth_provider',
  appleSub: 'apple_sub',
  appleEmail: 'apple_email',
  appleFullName: 'apple_full_name',
  appleEmailIsPrivate: 'apple_email_is_private',
  googleSub: 'google_sub',
  googleEmail: 'google_email',
  googleFullName: 'google_full_name',
  googleEmailVerified: 'google_email_verified',
};

function mapRowToAppUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    robloxUserId: row.roblox_user_id,
    robloxUsername: row.roblox_username,
    robloxDisplayName: row.roblox_display_name,
    robloxProfileUrl: row.roblox_profile_url,
    status: row.status,
    tokenVersion: row.token_version ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    avatarHeadshotUrl: row.avatar_headshot_url,
    avatarCachedAt: row.avatar_cached_at,
    authProvider: row.auth_provider ?? null,
    appleSub: row.apple_sub ?? null,
    appleEmail: row.apple_email ?? null,
    appleFullName: row.apple_full_name ?? null,
    appleEmailIsPrivate: row.apple_email_is_private ?? null,
    googleSub: row.google_sub ?? null,
    googleEmail: row.google_email ?? null,
    googleFullName: row.google_full_name ?? null,
    googleEmailVerified: row.google_email_verified ?? null,
  };
}

function toDbUpdatePayload(data: Partial<AppUser>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const dbColumn = APP_USER_COLUMN_MAP[key];
    if (!dbColumn) {
      continue;
    }
    payload[dbColumn] = value;
  }

  return payload;
}

export interface UserRepository {
  upsert(data: UpsertUserData): Promise<DbResult<AppUser>>;
  insert(data: InsertUserData): Promise<DbResult<AppUser>>;
  updateById(id: string, data: Partial<AppUser>): Promise<DbResult<AppUser>>;
  findById(id: string): Promise<DbResult<AppUser | null>>;
  findColumns(id: string, columns: string[]): Promise<DbResult<Partial<AppUser> | null>>;
  incrementTokenVersion(id: string): Promise<DbResult<void>>;
  findStatusAndTokenVersion(id: string): Promise<DbResult<{ status: string; token_version: number } | null>>;
}

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async upsert(data: UpsertUserData): Promise<DbResult<AppUser>> {
    const { data: row, error } = await this.supabase
      .from('app_users')
      .upsert(
        {
          roblox_user_id: data.robloxUserId,
          roblox_username: data.robloxUsername,
          roblox_display_name: data.robloxDisplayName ?? null,
          roblox_profile_url: data.robloxProfileUrl ?? null,
          last_login_at: data.lastLoginAt,
          updated_at: data.updatedAt,
        },
        { onConflict: 'roblox_user_id' }
      )
      .select(APP_USERS_BASE_SELECT.join(','))
      .single<AppUserRow>();

    if (error || !row) {
      return { data: null, error: { code: error?.code ?? 'SUPABASE_QUERY_ERROR', message: error?.message ?? 'Failed to upsert user' } };
    }

    return { data: mapRowToAppUser(row), error: null };
  }

  async insert(data: InsertUserData): Promise<DbResult<AppUser>> {
    const { data: row, error } = await this.supabase
      .from('app_users')
      .insert({
        roblox_user_id: data.robloxUserId ?? null,
        roblox_username: data.robloxUsername ?? null,
        roblox_display_name: data.robloxDisplayName ?? null,
        roblox_profile_url: data.robloxProfileUrl ?? null,
        last_login_at: data.lastLoginAt,
        updated_at: data.updatedAt,
      })
      .select(APP_USERS_BASE_SELECT.join(','))
      .single<AppUserRow>();

    if (error || !row) {
      return { data: null, error: { code: error?.code ?? 'SUPABASE_QUERY_ERROR', message: error?.message ?? 'Failed to insert user' } };
    }

    return { data: mapRowToAppUser(row), error: null };
  }

  async updateById(id: string, data: Partial<AppUser>): Promise<DbResult<AppUser>> {
    const payload = toDbUpdatePayload(data);
    const { data: row, error } = await this.supabase
      .from('app_users')
      .update(payload)
      .eq('id', id)
      .select(APP_USERS_BASE_SELECT.join(','))
      .single<AppUserRow>();

    if (error || !row) {
      return { data: null, error: { code: error?.code ?? 'SUPABASE_QUERY_ERROR', message: error?.message ?? 'Failed to update user' } };
    }

    return { data: mapRowToAppUser(row), error: null };
  }

  async findById(id: string): Promise<DbResult<AppUser | null>> {
    const { data: row, error } = await this.supabase
      .from('app_users')
      .select(APP_USERS_BASE_SELECT.join(','))
      .eq('id', id)
      .maybeSingle<AppUserRow>();

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    if (!row) {
      return { data: null, error: null };
    }

    return { data: mapRowToAppUser(row), error: null };
  }

  async findColumns(id: string, columns: string[]): Promise<DbResult<Partial<AppUser> | null>> {
    const dbColumns = columns
      .map((column) => APP_USER_COLUMN_MAP[column])
      .filter((column): column is string => Boolean(column));

    if (dbColumns.length === 0) {
      return { data: {}, error: null };
    }

    const { data: row, error } = await this.supabase
      .from('app_users')
      .select(dbColumns.join(','))
      .eq('id', id)
      .maybeSingle<Record<string, unknown>>();

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    if (!row) {
      return { data: null, error: null };
    }

    const mapped: Partial<AppUser> = {};
    for (const key of columns) {
      const dbColumn = APP_USER_COLUMN_MAP[key];
      if (!dbColumn) {
        continue;
      }
      (mapped as Record<string, unknown>)[key] = row[dbColumn];
    }

    return { data: mapped, error: null };
  }

  async incrementTokenVersion(id: string): Promise<DbResult<void>> {
    const { error } = await this.supabase.rpc('increment_user_token_version', { p_user_id: id });

    if (error) {
      const { data: current, error: readError } = await this.findStatusAndTokenVersion(id);
      if (readError || !current) {
        return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
      }

      const { error: updateError } = await this.supabase
        .from('app_users')
        .update({ token_version: Number(current.token_version ?? 0) + 1 })
        .eq('id', id);

      if (updateError) {
        return { data: null, error: { code: updateError.code ?? 'SUPABASE_QUERY_ERROR', message: updateError.message } };
      }
    }

    return { data: undefined, error: null };
  }

  async findStatusAndTokenVersion(id: string): Promise<DbResult<{ status: string; token_version: number } | null>> {
    const { data, error } = await this.supabase
      .from('app_users')
      .select('status, token_version')
      .eq('id', id)
      .maybeSingle<{ status: string; token_version: number | null }>();

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return {
      data: {
        status: data.status,
        token_version: Number(data.token_version ?? 0),
      },
      error: null,
    };
  }
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(data: UpsertUserData): Promise<DbResult<AppUser>> {
    try {
      const result = await this.pool.query<AppUserRow>(
        `INSERT INTO app_users (
          roblox_user_id,
          roblox_username,
          roblox_display_name,
          roblox_profile_url,
          last_login_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (roblox_user_id) DO UPDATE SET
          roblox_username = EXCLUDED.roblox_username,
          roblox_display_name = EXCLUDED.roblox_display_name,
          roblox_profile_url = EXCLUDED.roblox_profile_url,
          last_login_at = EXCLUDED.last_login_at,
          updated_at = EXCLUDED.updated_at
        RETURNING ${APP_USERS_BASE_SELECT.join(', ')}`,
        [
          data.robloxUserId,
          data.robloxUsername,
          data.robloxDisplayName ?? null,
          data.robloxProfileUrl ?? null,
          data.lastLoginAt,
          data.updatedAt,
        ]
      );

      return { data: mapRowToAppUser(result.rows[0]), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async insert(data: InsertUserData): Promise<DbResult<AppUser>> {
    try {
      const result = await this.pool.query<AppUserRow>(
        `INSERT INTO app_users (
          roblox_user_id,
          roblox_username,
          roblox_display_name,
          roblox_profile_url,
          last_login_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ${APP_USERS_BASE_SELECT.join(', ')}`,
        [
          data.robloxUserId ?? null,
          data.robloxUsername ?? null,
          data.robloxDisplayName ?? null,
          data.robloxProfileUrl ?? null,
          data.lastLoginAt,
          data.updatedAt,
        ]
      );

      return { data: mapRowToAppUser(result.rows[0]), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async updateById(id: string, data: Partial<AppUser>): Promise<DbResult<AppUser>> {
    const payload = toDbUpdatePayload(data);
    const entries = Object.entries(payload);

    if (entries.length === 0) {
      return this.findById(id) as Promise<DbResult<AppUser>>;
    }

    const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
    const values = entries.map(([, value]) => value);

    try {
      const result = await this.pool.query<AppUserRow>(
        `UPDATE app_users
         SET ${sets.join(', ')}
         WHERE id = $1
         RETURNING ${APP_USERS_BASE_SELECT.join(', ')}`,
        [id, ...values]
      );

      if (result.rows.length === 0) {
        return { data: null, error: { code: 'NOT_FOUND', message: 'User not found' } };
      }

      return { data: mapRowToAppUser(result.rows[0]), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findById(id: string): Promise<DbResult<AppUser | null>> {
    try {
      const result = await this.pool.query<AppUserRow>(
        `SELECT ${APP_USERS_BASE_SELECT.join(', ')} FROM app_users WHERE id = $1 LIMIT 1`,
        [id]
      );

      if (result.rows.length === 0) {
        return { data: null, error: null };
      }

      return { data: mapRowToAppUser(result.rows[0]), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findColumns(id: string, columns: string[]): Promise<DbResult<Partial<AppUser> | null>> {
    const dbColumns = columns
      .map((column) => APP_USER_COLUMN_MAP[column])
      .filter((column): column is string => Boolean(column));

    if (dbColumns.length === 0) {
      return { data: {}, error: null };
    }

    try {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT ${dbColumns.join(', ')} FROM app_users WHERE id = $1 LIMIT 1`,
        [id]
      );

      if (result.rows.length === 0) {
        return { data: null, error: null };
      }

      const row = result.rows[0];
      const mapped: Partial<AppUser> = {};
      for (const key of columns) {
        const dbColumn = APP_USER_COLUMN_MAP[key];
        if (!dbColumn) {
          continue;
        }
        (mapped as Record<string, unknown>)[key] = row[dbColumn];
      }

      return { data: mapped, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async incrementTokenVersion(id: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        'UPDATE app_users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1',
        [id]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findStatusAndTokenVersion(id: string): Promise<DbResult<{ status: string; token_version: number } | null>> {
    try {
      const result = await this.pool.query<{ status: string; token_version: number | null }>(
        'SELECT status, token_version FROM app_users WHERE id = $1 LIMIT 1',
        [id]
      );

      if (result.rows.length === 0) {
        return { data: null, error: null };
      }

      return {
        data: {
          status: result.rows[0].status,
          token_version: Number(result.rows[0].token_version ?? 0),
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
