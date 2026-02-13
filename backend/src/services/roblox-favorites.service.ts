import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { fetchWithTimeoutAndRetry } from '../lib/http.js';
import { RobloxEnrichmentService } from './roblox-enrichment.service.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

interface FavoritesResponse {
  data?: Array<Record<string, unknown>>;
  nextPageCursor?: string | null;
  previousPageCursor?: string | null;
}

interface UniverseDetailsResponse {
  rootPlaceId?: number;
}

interface FavoriteGameResult {
  universeId: number;
  placeId: number | null;
  name: string | null;
  thumbnailUrl: string | null;
  canonicalWebUrl: string | null;
  canonicalStartUrl: string | null;
}

interface FavoritePagination {
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  previousCursor: string | null;
}

export interface RobloxFavoritesResult {
  robloxUserId: string;
  favorites: FavoriteGameResult[];
  pagination: FavoritePagination;
}

interface ServiceDeps {
  supabase?: SupabaseClient;
  enrichmentService?: Pick<RobloxEnrichmentService, 'enrichGame'>;
  fetchFn?: typeof fetch;
}

export class RobloxFavoritesService {
  private readonly supabase: SupabaseClient;
  private readonly enrichmentService: Pick<RobloxEnrichmentService, 'enrichGame'>;
  private readonly fetchFn: typeof fetch;

  constructor(deps: ServiceDeps = {}) {
    this.supabase = deps.supabase ?? getSupabase();
    this.enrichmentService = deps.enrichmentService ?? new RobloxEnrichmentService();
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  async getFavoritesForUser(
    userId: string,
    params: { limit?: number; cursor?: string } = {}
  ): Promise<RobloxFavoritesResult> {
    const robloxUserId = await this.getRobloxUserId(userId);
    const limit = this.normalizeLimit(params.limit);
    const favoritesPayload = await this.fetchFavorites(robloxUserId, limit, params.cursor);
    const favoritesRaw = Array.isArray(favoritesPayload.data) ? favoritesPayload.data : [];

    const favorites = await Promise.all(
      favoritesRaw.map((item) => this.mapFavoriteItem(item))
    );

    return {
      robloxUserId,
      favorites,
      pagination: {
        limit,
        cursor: params.cursor ?? null,
        nextCursor: favoritesPayload.nextPageCursor ?? null,
        previousCursor: favoritesPayload.previousPageCursor ?? null,
      },
    };
  }

  private normalizeLimit(limit?: number): number {
    if (!limit || !Number.isFinite(limit)) {
      return 25;
    }

    return Math.max(1, Math.min(100, Math.floor(limit)));
  }

  private async getRobloxUserId(userId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('user_platforms')
      .select('platform_user_id')
      .eq('user_id', userId)
      .eq('platform_id', 'roblox')
      .maybeSingle<{ platform_user_id: string | null }>();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load Roblox link: ${error.message}`, 500);
    }

    const platformRobloxUserId = data?.platform_user_id?.trim();
    if (platformRobloxUserId) {
      return platformRobloxUserId;
    }

    // Backward compatibility: current OAuth flow persists Roblox identity in app_users.
    const { data: appUserData, error: appUserError } = await this.supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userId)
      .maybeSingle<{ roblox_user_id: string | null }>();

    if (appUserError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load Roblox link: ${appUserError.message}`, 500);
    }

    const appUserRobloxUserId = appUserData?.roblox_user_id?.trim();
    if (appUserRobloxUserId) {
      return appUserRobloxUserId;
    }

    throw new AppError('ROBLOX_NOT_CONNECTED', 'Roblox account is not connected', 409, {
      severity: 'warning',
    });
  }

  private async fetchFavorites(robloxUserId: string, limit: number, cursor?: string): Promise<FavoritesResponse> {
    const search = new URLSearchParams();
    search.set('limit', String(limit));
    if (cursor) {
      search.set('cursor', cursor);
    }

    const url = `https://games.roblox.com/v2/users/${encodeURIComponent(robloxUserId)}/favorite/games?${search.toString()}`;
    let response: Response;

    try {
      response = await fetchWithTimeoutAndRetry(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'lagalaga-backend/1.0',
          },
        },
        {
          fetchFn: this.fetchFn,
          timeoutMs: 5000,
          retries: 1,
        }
      );
    } catch (error) {
      throw new AppError('ROBLOX_UPSTREAM_FAILED', 'Failed to fetch Roblox favorites', 502, {
        severity: 'warning',
        metadata: {
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }

    if (!response.ok) {
      throw new AppError('ROBLOX_UPSTREAM_FAILED', 'Failed to fetch Roblox favorites', 502, {
        severity: 'warning',
        metadata: { statusCode: response.status },
      });
    }

    return (await response.json()) as FavoritesResponse;
  }

  private async mapFavoriteItem(item: Record<string, unknown>): Promise<FavoriteGameResult> {
    const universeId = this.extractUniverseId(item);
    const upstreamName = this.extractFavoriteName(item);
    if (!universeId) {
      return {
        universeId: 0,
        placeId: null,
        name: upstreamName,
        thumbnailUrl: null,
        canonicalWebUrl: null,
        canonicalStartUrl: null,
      };
    }

    const placeId = await this.resolveRootPlaceId(universeId);
    if (!placeId) {
      return {
        universeId,
        placeId: null,
        name: upstreamName,
        thumbnailUrl: null,
        canonicalWebUrl: null,
        canonicalStartUrl: null,
      };
    }

    const canonicalWebUrl = `https://www.roblox.com/games/${placeId}`;
    const canonicalStartUrl = `https://www.roblox.com/games/start?placeId=${placeId}`;

    const cached = await this.getCachedGame(placeId);
    if (cached && cached.game_name && cached.thumbnail_url) {
      return {
        universeId,
        placeId,
        name: cached.game_name,
        thumbnailUrl: cached.thumbnail_url,
        canonicalWebUrl: cached.canonical_web_url ?? canonicalWebUrl,
        canonicalStartUrl: cached.canonical_start_url ?? canonicalStartUrl,
      };
    }

    await this.ensureGameSkeleton(placeId, canonicalWebUrl, canonicalStartUrl);

    try {
      const enriched = await this.enrichmentService.enrichGame(placeId);
      return {
        universeId,
        placeId,
        name: enriched.name ?? upstreamName,
        thumbnailUrl: enriched.thumbnailUrl ?? null,
        canonicalWebUrl,
        canonicalStartUrl,
      };
    } catch (error) {
      logger.warn(
        {
          universeId,
          placeId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to enrich Roblox favorite game'
      );

      const afterFailure = await this.getCachedGame(placeId);
      return {
        universeId,
        placeId,
        name: afterFailure?.game_name ?? upstreamName,
        thumbnailUrl: afterFailure?.thumbnail_url ?? null,
        canonicalWebUrl: afterFailure?.canonical_web_url ?? canonicalWebUrl,
        canonicalStartUrl: afterFailure?.canonical_start_url ?? canonicalStartUrl,
      };
    }
  }

  private extractFavoriteName(item: Record<string, unknown>): string | null {
    const directName = item.name;
    if (typeof directName === 'string' && directName.trim().length > 0) {
      return directName.trim();
    }

    const gameObj = item.game as Record<string, unknown> | undefined;
    const nestedName = gameObj?.name;
    if (typeof nestedName === 'string' && nestedName.trim().length > 0) {
      return nestedName.trim();
    }

    return null;
  }

  private extractUniverseId(item: Record<string, unknown>): number | null {
    const direct = item.universeId;
    if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const id = item.id;
    if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
      return id;
    }

    const universeObj = item.universe as Record<string, unknown> | undefined;
    const nestedId = universeObj?.id;
    if (typeof nestedId === 'number' && Number.isFinite(nestedId) && nestedId > 0) {
      return nestedId;
    }

    return null;
  }

  private async resolveRootPlaceId(universeId: number): Promise<number | null> {
    const url = `https://develop.roblox.com/v1/universes/${encodeURIComponent(String(universeId))}`;

    try {
      const response = await fetchWithTimeoutAndRetry(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'lagalaga-backend/1.0',
          },
        },
        {
          fetchFn: this.fetchFn,
          timeoutMs: 5000,
          retries: 1,
        }
      );

      if (!response.ok) {
        logger.warn({ universeId, statusCode: response.status }, 'Universe -> rootPlaceId lookup failed');
        return null;
      }

      const data = (await response.json()) as UniverseDetailsResponse;
      const placeId = data.rootPlaceId;

      return typeof placeId === 'number' && Number.isFinite(placeId) && placeId > 0
        ? placeId
        : null;
    } catch (error) {
      logger.warn(
        {
          universeId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Universe -> rootPlaceId request failed'
      );
      return null;
    }
  }

  private async getCachedGame(placeId: number): Promise<{
    game_name: string | null;
    thumbnail_url: string | null;
    canonical_web_url: string | null;
    canonical_start_url: string | null;
  } | null> {
    const { data, error } = await this.supabase
      .from('games')
      .select('game_name,thumbnail_url,canonical_web_url,canonical_start_url')
      .eq('place_id', placeId)
      .maybeSingle<{
        game_name: string | null;
        thumbnail_url: string | null;
        canonical_web_url: string | null;
        canonical_start_url: string | null;
      }>();

    if (error) {
      logger.warn({ placeId, error: error.message }, 'Failed to read cached game');
      return null;
    }

    return data ?? null;
  }

  private async ensureGameSkeleton(
    placeId: number,
    canonicalWebUrl: string,
    canonicalStartUrl: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('games')
      .upsert(
        {
          place_id: placeId,
          canonical_web_url: canonicalWebUrl,
          canonical_start_url: canonicalStartUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'place_id',
          ignoreDuplicates: false,
        }
      );

    if (error) {
      logger.warn({ placeId, error: error.message }, 'Failed to upsert game skeleton for favorite');
    }
  }
}
