import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export interface CacheCleanupRepository {
  deleteExperienceCacheBefore(cutoffIso: string): Promise<DbResult<number>>;
  deleteFriendsCacheBefore(cutoffIso: string): Promise<DbResult<number>>;
  deleteFavoritesCacheBefore(cutoffIso: string): Promise<DbResult<number>>;
  deleteGamesBefore(cutoffIso: string): Promise<DbResult<number>>;
}

export class SupabaseCacheCleanupRepository implements CacheCleanupRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async deleteExperienceCacheBefore(cutoffIso: string): Promise<DbResult<number>> {
    const { count, error } = await this.supabase
      .from('roblox_experience_cache')
      .delete({ count: 'exact' })
      .lt('updated_at', cutoffIso);

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: count ?? 0, error: null };
  }

  async deleteFriendsCacheBefore(cutoffIso: string): Promise<DbResult<number>> {
    const { count, error } = await this.supabase
      .from('roblox_friends_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', cutoffIso);

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: count ?? 0, error: null };
  }

  async deleteFavoritesCacheBefore(cutoffIso: string): Promise<DbResult<number>> {
    const { count, error } = await this.supabase
      .from('user_favorites_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', cutoffIso);

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: count ?? 0, error: null };
  }

  async deleteGamesBefore(cutoffIso: string): Promise<DbResult<number>> {
    const { count, error } = await this.supabase
      .from('games')
      .delete({ count: 'exact' })
      .lt('thumbnail_cached_at', cutoffIso);

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: count ?? 0, error: null };
  }
}

export class PgCacheCleanupRepository implements CacheCleanupRepository {
  constructor(private readonly pool: Pool) {}

  async deleteExperienceCacheBefore(cutoffIso: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query(
        'DELETE FROM roblox_experience_cache WHERE updated_at < $1',
        [cutoffIso]
      );
      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async deleteFriendsCacheBefore(cutoffIso: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query(
        'DELETE FROM roblox_friends_cache WHERE expires_at < $1',
        [cutoffIso]
      );
      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async deleteFavoritesCacheBefore(cutoffIso: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query(
        'DELETE FROM user_favorites_cache WHERE expires_at < $1',
        [cutoffIso]
      );
      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async deleteGamesBefore(cutoffIso: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query(
        'DELETE FROM games WHERE thumbnail_cached_at < $1',
        [cutoffIso]
      );
      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
