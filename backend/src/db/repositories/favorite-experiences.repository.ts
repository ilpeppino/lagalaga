import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

export interface FavoriteExperienceCacheRow {
  user_id: string;
  favorites_json: unknown[];
  etag: string;
  cached_at: string;
  expires_at: string;
}

export interface FavoriteExperiencesRepository {
  findCacheRow(userId: string): Promise<DbResult<FavoriteExperienceCacheRow | null>>;
  upsertCacheRow(input: FavoriteExperienceCacheRow): Promise<DbResult<void>>;
  updateCacheTimestamps(userId: string, cachedAt: string, expiresAt: string): Promise<DbResult<void>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseFavoriteExperiencesRepository implements FavoriteExperiencesRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async findCacheRow(userId: string): Promise<DbResult<FavoriteExperienceCacheRow | null>> {
    const { data, error } = await this.supabase
      .from('user_favorites_cache')
      .select('user_id, favorites_json, etag, cached_at, expires_at')
      .eq('user_id', userId)
      .maybeSingle<FavoriteExperienceCacheRow>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data ?? null, error: null };
  }

  async upsertCacheRow(input: FavoriteExperienceCacheRow): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_favorites_cache')
      .upsert(
        {
          user_id: input.user_id,
          favorites_json: input.favorites_json,
          etag: input.etag,
          cached_at: input.cached_at,
          expires_at: input.expires_at,
        },
        { onConflict: 'user_id' }
      );

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async updateCacheTimestamps(userId: string, cachedAt: string, expiresAt: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_favorites_cache')
      .update({
        cached_at: cachedAt,
        expires_at: expiresAt,
      })
      .eq('user_id', userId);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }
}

export class PgFavoriteExperiencesRepository implements FavoriteExperiencesRepository {
  constructor(private readonly pool: Pool) {}

  async findCacheRow(userId: string): Promise<DbResult<FavoriteExperienceCacheRow | null>> {
    try {
      const result = await this.pool.query<FavoriteExperienceCacheRow>(
        `SELECT user_id::text, favorites_json, etag, cached_at::text, expires_at::text
         FROM user_favorites_cache
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async upsertCacheRow(input: FavoriteExperienceCacheRow): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `INSERT INTO user_favorites_cache (user_id, favorites_json, etag, cached_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           favorites_json = EXCLUDED.favorites_json,
           etag = EXCLUDED.etag,
           cached_at = EXCLUDED.cached_at,
           expires_at = EXCLUDED.expires_at`,
        [
          input.user_id,
          input.favorites_json,
          input.etag,
          input.cached_at,
          input.expires_at,
        ]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async updateCacheTimestamps(userId: string, cachedAt: string, expiresAt: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE user_favorites_cache
         SET cached_at = $2,
             expires_at = $3
         WHERE user_id = $1`,
        [userId, cachedAt, expiresAt]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
