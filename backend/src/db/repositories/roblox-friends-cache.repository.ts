import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

export interface RobloxFriendsUserCacheRow {
  user_id: string;
  roblox_user_id: number;
  fetched_at: string;
  expires_at: string;
  friends_json: unknown;
}

export interface RobloxFriendsCacheRepository {
  findPlatformRobloxUserId(userId: string): Promise<DbResult<string | null>>;
  findAppUserRobloxUserId(userId: string): Promise<DbResult<string | null>>;
  findCacheRow(userId: string): Promise<DbResult<RobloxFriendsUserCacheRow | null>>;
  upsertCacheRow(input: {
    userId: string;
    robloxUserId: number;
    fetchedAtIso: string;
    expiresAtIso: string;
    friendsJson: unknown;
    updatedAtIso: string;
  }): Promise<DbResult<void>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseRobloxFriendsCacheRepository implements RobloxFriendsCacheRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async findPlatformRobloxUserId(userId: string): Promise<DbResult<string | null>> {
    const { data, error } = await this.supabase
      .from('user_platforms')
      .select('platform_user_id')
      .eq('user_id', userId)
      .eq('platform_id', 'roblox')
      .maybeSingle<{ platform_user_id: string | null }>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data?.platform_user_id?.trim() || null, error: null };
  }

  async findAppUserRobloxUserId(userId: string): Promise<DbResult<string | null>> {
    const { data, error } = await this.supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userId)
      .maybeSingle<{ roblox_user_id: string | null }>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data?.roblox_user_id?.trim() || null, error: null };
  }

  async findCacheRow(userId: string): Promise<DbResult<RobloxFriendsUserCacheRow | null>> {
    const { data, error } = await this.supabase
      .from('roblox_friends_cache')
      .select('user_id,roblox_user_id,fetched_at,expires_at,friends_json')
      .eq('user_id', userId)
      .maybeSingle<RobloxFriendsUserCacheRow>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data ?? null, error: null };
  }

  async upsertCacheRow(input: {
    userId: string;
    robloxUserId: number;
    fetchedAtIso: string;
    expiresAtIso: string;
    friendsJson: unknown;
    updatedAtIso: string;
  }): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('roblox_friends_cache')
      .upsert({
        user_id: input.userId,
        roblox_user_id: input.robloxUserId,
        fetched_at: input.fetchedAtIso,
        expires_at: input.expiresAtIso,
        friends_json: input.friendsJson,
        updated_at: input.updatedAtIso,
      });

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }
}

export class PgRobloxFriendsCacheRepository implements RobloxFriendsCacheRepository {
  constructor(private readonly pool: Pool) {}

  async findPlatformRobloxUserId(userId: string): Promise<DbResult<string | null>> {
    try {
      const result = await this.pool.query<{ platform_user_id: string | null }>(
        `SELECT platform_user_id
         FROM user_platforms
         WHERE user_id = $1
           AND platform_id = 'roblox'
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0]?.platform_user_id?.trim() || null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findAppUserRobloxUserId(userId: string): Promise<DbResult<string | null>> {
    try {
      const result = await this.pool.query<{ roblox_user_id: string | null }>(
        `SELECT roblox_user_id
         FROM app_users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0]?.roblox_user_id?.trim() || null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findCacheRow(userId: string): Promise<DbResult<RobloxFriendsUserCacheRow | null>> {
    try {
      const result = await this.pool.query<RobloxFriendsUserCacheRow>(
        `SELECT user_id::text, roblox_user_id, fetched_at::text, expires_at::text, friends_json
         FROM roblox_friends_cache
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async upsertCacheRow(input: {
    userId: string;
    robloxUserId: number;
    fetchedAtIso: string;
    expiresAtIso: string;
    friendsJson: unknown;
    updatedAtIso: string;
  }): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `INSERT INTO roblox_friends_cache
          (user_id, roblox_user_id, fetched_at, expires_at, friends_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           roblox_user_id = EXCLUDED.roblox_user_id,
           fetched_at = EXCLUDED.fetched_at,
           expires_at = EXCLUDED.expires_at,
           friends_json = EXCLUDED.friends_json,
           updated_at = EXCLUDED.updated_at`,
        [
          input.userId,
          input.robloxUserId,
          input.fetchedAtIso,
          input.expiresAtIso,
          input.friendsJson,
          input.updatedAtIso,
        ]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
