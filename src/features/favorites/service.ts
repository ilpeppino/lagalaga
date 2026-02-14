import { apiGet } from '@/src/lib/api';
import { logger } from '@/src/lib/logger';
import {
  Favorite,
  FavoritesCachePayload,
  loadCachedFavorites,
  saveCachedFavorites,
} from './cache';

interface FavoriteExperiencesApiResponse {
  favorites: Favorite[];
  etag: string;
  fetchedAt: string;
}

export async function refreshFavorites(
  userId: string
): Promise<{ favorites: Favorite[]; etag: string; fetchedAt: string; source: 'network' | 'not_modified' }> {
  if (!userId) {
    return {
      favorites: [],
      etag: '',
      fetchedAt: new Date(0).toISOString(),
      source: 'not_modified',
    };
  }

  const cached = await loadCachedFavorites(userId);
  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag;
  }

  const response = await apiGet<FavoriteExperiencesApiResponse>('/api/me/favorite-experiences', { headers });
  if (response.status === 304) {
    return {
      favorites: cached?.favorites ?? [],
      etag: cached?.etag ?? '',
      fetchedAt: cached?.cachedAt ?? new Date(0).toISOString(),
      source: 'not_modified',
    };
  }

  const data = response.data;
  if (!data) {
    throw new Error('Missing favorites response payload');
  }

  const payload: FavoritesCachePayload = {
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    etag: data.etag,
    cachedAt: data.fetchedAt,
  };
  await saveCachedFavorites(userId, payload);

  return {
    favorites: payload.favorites,
    etag: payload.etag,
    fetchedAt: payload.cachedAt,
    source: 'network',
  };
}

export async function warmFavorites(userId: string): Promise<void> {
  if (!userId) {
    return;
  }

  await loadCachedFavorites(userId);
  void refreshFavorites(userId).catch((error) => {
    logger.warn('Failed to warm favorites cache', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
