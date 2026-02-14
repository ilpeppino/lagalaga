import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { RobloxFavoritesService } from './roblox-favorites.service.js';

const SERVER_CACHE_TTL_MS = 15 * 60 * 1000;

export interface FavoriteExperience {
  id: string;
  name: string;
  url?: string;
  thumbnailUrl?: string;
}

interface CachedFavoritesRow {
  user_id: string;
  favorites_json: FavoriteExperience[];
  etag: string;
  cached_at: string;
  expires_at: string;
}

export interface FavoriteExperiencesResponse {
  favorites: FavoriteExperience[];
  etag: string;
  fetchedAt: string;
}

export type FavoriteExperiencesResult =
  | { kind: 'not_modified'; etag: string }
  | { kind: 'ok'; payload: FavoriteExperiencesResponse };

interface ServiceDeps {
  supabase?: SupabaseClient;
  robloxFavoritesService?: RobloxFavoritesService;
}

export class FavoriteExperiencesService {
  private readonly supabase: SupabaseClient;
  private readonly robloxFavoritesService: RobloxFavoritesService;
  private readonly inFlightRefreshes = new Map<string, Promise<void>>();

  constructor(deps: ServiceDeps = {}) {
    this.supabase = deps.supabase ?? getSupabase();
    this.robloxFavoritesService = deps.robloxFavoritesService ?? new RobloxFavoritesService();
  }

  async getFavoriteExperiences(
    userId: string,
    robloxUserId: string,
    ifNoneMatchHeader?: string
  ): Promise<FavoriteExperiencesResult> {
    const cachedRow = await this.readCacheRow(userId);
    const ifNoneMatch = parseIfNoneMatch(ifNoneMatchHeader);

    if (cachedRow) {
      if (ifNoneMatch && ifNoneMatch.has(cachedRow.etag)) {
        return {
          kind: 'not_modified',
          etag: cachedRow.etag,
        };
      }

      const payload: FavoriteExperiencesResponse = {
        favorites: normalizeFavorites(cachedRow.favorites_json),
        etag: cachedRow.etag,
        fetchedAt: cachedRow.cached_at,
      };

      if (new Date(cachedRow.expires_at).getTime() > Date.now()) {
        return {
          kind: 'ok',
          payload,
        };
      }

      this.triggerBackgroundRefresh(userId, robloxUserId);
      return {
        kind: 'ok',
        payload,
      };
    }

    const favorites = await this.fetchRobloxFavoriteExperiences(robloxUserId);
    const etag = createFavoritesEtag(favorites);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SERVER_CACHE_TTL_MS);

    await this.upsertCacheRow({
      user_id: userId,
      favorites_json: favorites,
      etag,
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    return {
      kind: 'ok',
      payload: {
        favorites,
        etag,
        fetchedAt: now.toISOString(),
      },
    };
  }

  private triggerBackgroundRefresh(userId: string, robloxUserId: string): void {
    if (this.inFlightRefreshes.has(userId)) {
      return;
    }

    const refreshPromise = this.refreshCacheRow(userId, robloxUserId)
      .catch((error) => {
        logger.warn(
          {
            userId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to refresh favorite experiences cache'
        );
      })
      .finally(() => {
        this.inFlightRefreshes.delete(userId);
      });

    this.inFlightRefreshes.set(userId, refreshPromise);
    void refreshPromise;
  }

  private async refreshCacheRow(userId: string, robloxUserId: string): Promise<void> {
    const existingRow = await this.readCacheRow(userId);
    if (!existingRow) {
      return;
    }

    const favorites = await this.fetchRobloxFavoriteExperiences(robloxUserId);
    const normalizedFavorites = normalizeFavorites(favorites);
    const nextEtag = createFavoritesEtag(normalizedFavorites);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SERVER_CACHE_TTL_MS);

    if (nextEtag === existingRow.etag) {
      await this.updateCacheTimestamps(userId, now.toISOString(), expiresAt.toISOString());
      return;
    }

    await this.upsertCacheRow({
      user_id: userId,
      favorites_json: normalizedFavorites,
      etag: nextEtag,
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  }

  async fetchRobloxFavoriteExperiences(robloxUserId: string): Promise<FavoriteExperience[]> {
    // TODO: If Roblox adds a minimal favorites endpoint with place URLs, swap this to avoid enrichment work.
    const fullFavorites = await this.robloxFavoritesService.getFavoritesForRobloxUserId(robloxUserId, {
      limit: 100,
    });

    return normalizeFavorites(
      fullFavorites.favorites
        .map((favorite) => {
          const bestId = favorite.placeId ? String(favorite.placeId) : String(favorite.universeId);
          if (!bestId || bestId === '0') {
            return null;
          }

          const mapped: FavoriteExperience = {
            id: bestId,
            name: favorite.name ?? 'Unnamed Experience',
            url: favorite.canonicalWebUrl ?? undefined,
            thumbnailUrl: favorite.thumbnailUrl ?? undefined,
          };

          return mapped;
        })
        .filter((favorite): favorite is FavoriteExperience => favorite !== null)
    );
  }

  private async readCacheRow(userId: string): Promise<CachedFavoritesRow | null> {
    const { data, error } = await this.supabase
      .from('user_favorites_cache')
      .select('user_id, favorites_json, etag, cached_at, expires_at')
      .eq('user_id', userId)
      .maybeSingle<CachedFavoritesRow>();

    if (error) {
      logger.warn({ userId, error: error.message }, 'Failed to load user_favorites_cache row');
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      ...data,
      favorites_json: normalizeFavorites(data.favorites_json),
    };
  }

  private async upsertCacheRow(row: CachedFavoritesRow): Promise<void> {
    const { error } = await this.supabase
      .from('user_favorites_cache')
      .upsert(
        {
          user_id: row.user_id,
          favorites_json: row.favorites_json,
          etag: row.etag,
          cached_at: row.cached_at,
          expires_at: row.expires_at,
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      throw new Error(`Failed to upsert user_favorites_cache: ${error.message}`);
    }
  }

  private async updateCacheTimestamps(userId: string, cachedAt: string, expiresAt: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_favorites_cache')
      .update({
        cached_at: cachedAt,
        expires_at: expiresAt,
      })
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to update user_favorites_cache timestamps: ${error.message}`);
    }
  }
}

function parseIfNoneMatch(ifNoneMatchHeader?: string): Set<string> | null {
  if (!ifNoneMatchHeader) {
    return null;
  }

  const values = ifNoneMatchHeader
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  return new Set(values);
}

function normalizeFavorites(input: unknown): FavoriteExperience[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item): FavoriteExperience | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      if (!id) {
        return null;
      }

      const name =
        typeof record.name === 'string' && record.name.trim().length > 0
          ? record.name.trim()
          : 'Unnamed Experience';
      const url = typeof record.url === 'string' && record.url.trim().length > 0
        ? record.url.trim()
        : undefined;
      const thumbnailUrl = typeof record.thumbnailUrl === 'string' && record.thumbnailUrl.trim().length > 0
        ? record.thumbnailUrl.trim()
        : undefined;

      return { id, name, url, thumbnailUrl };
    })
    .filter((item): item is FavoriteExperience => item !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function createFavoritesEtag(favorites: FavoriteExperience[]): string {
  const normalized = normalizeFavorites(favorites).map((favorite) => ({
    id: favorite.id,
    name: favorite.name,
    url: favorite.url ?? '',
    thumbnailUrl: favorite.thumbnailUrl ?? '',
  }));

  const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return `W/"${hash}"`;
}
