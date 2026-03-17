import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFavoriteExperiencesRepository } from '../db/repository-factory.js';
import { FAVORITES_CACHE_TTL_MS } from '../config/cache.js';
import { logger } from '../lib/logger.js';
import { RobloxFavoritesService } from './roblox-favorites.service.js';
import {
  SupabaseFavoriteExperiencesRepository,
  type FavoriteExperiencesRepository,
} from '../db/repositories/favorite-experiences.repository.js';

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

interface GetFavoriteExperiencesOptions {
  forceRefresh?: boolean;
}

interface ServiceDeps {
  supabase?: SupabaseClient;
  robloxFavoritesService?: RobloxFavoritesService;
  repository?: FavoriteExperiencesRepository;
}

export class FavoriteExperiencesService {
  private readonly repository: FavoriteExperiencesRepository;
  private readonly robloxFavoritesService: RobloxFavoritesService;
  private readonly inFlightRefreshes = new Map<string, Promise<void>>();
  private warnedMissingCacheTable = false;

  constructor(deps: ServiceDeps = {}) {
    this.repository = deps.repository
      ?? (deps.supabase ? new SupabaseFavoriteExperiencesRepository(deps.supabase) : createFavoriteExperiencesRepository());
    this.robloxFavoritesService = deps.robloxFavoritesService ?? new RobloxFavoritesService();
  }

  async getFavoriteExperiences(
    userId: string,
    robloxUserId: string,
    ifNoneMatchHeader?: string,
    options: GetFavoriteExperiencesOptions = {}
  ): Promise<FavoriteExperiencesResult> {
    if (options.forceRefresh) {
      return this.fetchAndPersistFavorites(userId, robloxUserId);
    }

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

    return this.fetchAndPersistFavorites(userId, robloxUserId);
  }

  private async fetchAndPersistFavorites(userId: string, robloxUserId: string): Promise<FavoriteExperiencesResult> {
    const favorites = await this.fetchRobloxFavoriteExperiences(robloxUserId);
    const etag = createFavoritesEtag(favorites);
    const now = new Date();
    const cachedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + FAVORITES_CACHE_TTL_MS).toISOString();

    await this.upsertCacheRow({
      user_id: userId,
      favorites_json: favorites,
      etag,
      cached_at: cachedAt,
      expires_at: expiresAt,
    });

    return {
      kind: 'ok',
      payload: {
        favorites,
        etag,
        fetchedAt: cachedAt,
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
    const expiresAt = new Date(now.getTime() + FAVORITES_CACHE_TTL_MS);

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
    const { data, error } = await this.repository.findCacheRow(userId);

    if (error) {
      if (this.isMissingCacheTableError(error.message)) {
        this.logMissingTableWarningOnce(error.message);
        return null;
      }
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
    const { error } = await this.repository.upsertCacheRow({
      user_id: row.user_id,
      favorites_json: row.favorites_json,
      etag: row.etag,
      cached_at: row.cached_at,
      expires_at: row.expires_at,
    });

    if (error && !this.isMissingCacheTableError(error.message)) {
      throw new Error(`Failed to upsert user_favorites_cache: ${error.message}`);
    }
    if (error) {
      this.logMissingTableWarningOnce(error.message);
    }
  }

  private async updateCacheTimestamps(userId: string, cachedAt: string, expiresAt: string): Promise<void> {
    const { error } = await this.repository.updateCacheTimestamps(userId, cachedAt, expiresAt);

    if (error && !this.isMissingCacheTableError(error.message)) {
      throw new Error(`Failed to update user_favorites_cache timestamps: ${error.message}`);
    }
    if (error) {
      this.logMissingTableWarningOnce(error.message);
    }
  }

  private isMissingCacheTableError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('user_favorites_cache')
      && (lower.includes('could not find the table') || lower.includes('relation') || lower.includes('does not exist'))
    );
  }

  private logMissingTableWarningOnce(errorMessage: string): void {
    if (this.warnedMissingCacheTable) {
      return;
    }
    this.warnedMissingCacheTable = true;
    logger.warn(
      { error: errorMessage },
      'user_favorites_cache table is missing; favorites cache will run in no-persist fallback mode'
    );
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
