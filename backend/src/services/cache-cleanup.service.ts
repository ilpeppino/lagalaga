import { getSupabase } from '../config/supabase.js';
import { GAMES_CACHE_RETENTION_MS, ROBLOX_EXPERIENCE_CACHE_TTL_MS } from '../config/cache.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export interface CacheCleanupRunResult {
  deletedExperienceCacheCount: number;
  deletedFriendsCacheCount: number;
  deletedFavoritesCacheCount: number;
  deletedGamesCount: number;
  checkedAt: string;
}

const FAVORITES_CLEANUP_GRACE_MS = 60 * 60 * 1000;

export class CacheCleanupService {
  async processCleanup(now: Date = new Date()): Promise<CacheCleanupRunResult> {
    const nowIso = now.toISOString();
    const experienceCutoffIso = new Date(now.getTime() - ROBLOX_EXPERIENCE_CACHE_TTL_MS).toISOString();
    const favoritesCutoffIso = new Date(now.getTime() - FAVORITES_CLEANUP_GRACE_MS).toISOString();
    const gamesCutoffIso = new Date(now.getTime() - GAMES_CACHE_RETENTION_MS).toISOString();

    const [
      deletedExperienceCacheCount,
      deletedFriendsCacheCount,
      deletedFavoritesCacheCount,
      deletedGamesCount,
    ] = await Promise.all([
      this.deleteExperienceCache(experienceCutoffIso),
      this.deleteFriendsCache(nowIso),
      this.deleteFavoritesCache(favoritesCutoffIso),
      this.deleteStaleGames(gamesCutoffIso),
    ]);

    return {
      deletedExperienceCacheCount,
      deletedFriendsCacheCount,
      deletedFavoritesCacheCount,
      deletedGamesCount,
      checkedAt: nowIso,
    };
  }

  private async deleteExperienceCache(cutoffIso: string): Promise<number> {
    const { count, error } = await getSupabase()
      .from('roblox_experience_cache')
      .delete({ count: 'exact' })
      .lt('updated_at', cutoffIso);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to clean roblox_experience_cache: ${error.message}`);
    }

    return count ?? 0;
  }

  private async deleteFriendsCache(nowIso: string): Promise<number> {
    const { count, error } = await getSupabase()
      .from('roblox_friends_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', nowIso);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to clean roblox_friends_cache: ${error.message}`);
    }

    return count ?? 0;
  }

  private async deleteFavoritesCache(cutoffIso: string): Promise<number> {
    const { count, error } = await getSupabase()
      .from('user_favorites_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', cutoffIso);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to clean user_favorites_cache: ${error.message}`);
    }

    return count ?? 0;
  }

  private async deleteStaleGames(cutoffIso: string): Promise<number> {
    const { count, error } = await getSupabase()
      .from('games')
      .delete({ count: 'exact' })
      .lt('thumbnail_cached_at', cutoffIso);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to clean stale games cache: ${error.message}`);
    }

    return count ?? 0;
  }
}
