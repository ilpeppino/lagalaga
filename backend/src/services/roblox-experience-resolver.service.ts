import { getSupabase } from '../config/supabase.js';
import { fetchJsonWithTimeoutRetry, type FetchLike } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../utils/errors.js';

export interface ResolvedExperience {
  placeId: number;
  universeId: number | null;
  name: string | null;
  description: string | null;
  creatorId: number | null;
  creatorName: string | null;
  maxPlayers: number | null;
  visits: number | null;
  playing: number | null;
  iconUrl: string | null;
  canonicalWebUrl: string;
  canonicalStartUrl: string;
}

interface UniverseLookupResponse {
  universeId: number;
}

interface GameDetailsResponse {
  data: Array<{
    id: number;
    name?: string;
    description?: string;
    creator?: {
      id?: number;
      name?: string;
    };
    maxPlayers?: number;
    visits?: number;
    playing?: number;
  }>;
}

interface GameIconResponse {
  data: Array<{
    targetId: number;
    state: string;
    imageUrl: string | null;
  }>;
}

interface GamesRow {
  place_id: number;
  canonical_web_url?: string | null;
  canonical_start_url?: string | null;
  game_name?: string | null;
  thumbnail_url?: string | null;
  game_description?: string | null;
}

interface SupabaseLike {
  from(table: 'games'): {
    select(columns: string): {
      eq(column: 'place_id', value: number): {
        maybeSingle<T = GamesRow>(): Promise<{ data: T | null; error: { code?: string; message?: string } | null }>;
      };
    };
    upsert(
      payload: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): Promise<{ error: { message?: string } | null }>;
  };
}

export interface RobloxExperienceResolverServiceOptions {
  fetchFn?: FetchLike;
  supabase?: SupabaseLike;
}

const CACHE_MISS_CODE = 'PGRST116';

export class RobloxExperienceResolverService {
  private readonly fetchFn: FetchLike;
  private readonly supabase: SupabaseLike;

  constructor(options: RobloxExperienceResolverServiceOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.supabase = options.supabase ?? (getSupabase() as unknown as SupabaseLike);
  }

  async resolveExperienceByPlaceId(placeId: number): Promise<ResolvedExperience> {
    if (!Number.isInteger(placeId) || placeId <= 0) {
      throw new ValidationError('placeId must be a positive integer');
    }

    const canonicalWebUrl = `https://www.roblox.com/games/${placeId}`;
    const canonicalStartUrl = `https://www.roblox.com/games/start?placeId=${placeId}`;

    logger.info({ placeId }, 'Resolving Roblox experience metadata by placeId');

    const cached = await this.getCachedGame(placeId);
    if (cached && this.isCompleteCacheHit(cached)) {
      logger.info({ placeId }, 'Returning cached Roblox experience metadata');
      return {
        placeId,
        universeId: null,
        name: cached.game_name ?? null,
        description: cached.game_description ?? null,
        creatorId: null,
        creatorName: null,
        maxPlayers: null,
        visits: null,
        playing: null,
        iconUrl: cached.thumbnail_url ?? null,
        canonicalWebUrl: cached.canonical_web_url || canonicalWebUrl,
        canonicalStartUrl: cached.canonical_start_url || canonicalStartUrl,
      };
    }

    const base: ResolvedExperience = {
      placeId,
      universeId: null,
      name: cached?.game_name ?? null,
      description: cached?.game_description ?? null,
      creatorId: null,
      creatorName: null,
      maxPlayers: null,
      visits: null,
      playing: null,
      iconUrl: cached?.thumbnail_url ?? null,
      canonicalWebUrl,
      canonicalStartUrl,
    };

    const universeId = await this.fetchUniverseId(placeId);
    if (!universeId) {
      logger.warn({ placeId }, 'Universe lookup failed; returning canonical-only metadata');
      await this.upsertGame(base);
      return base;
    }

    base.universeId = universeId;

    const [detailsResult, iconResult] = await Promise.allSettled([
      this.fetchGameDetails(universeId),
      this.fetchGameIcon(universeId),
    ]);

    if (detailsResult.status === 'fulfilled' && detailsResult.value) {
      const details = detailsResult.value;
      base.name = details.name;
      base.description = details.description;
      base.creatorId = details.creatorId;
      base.creatorName = details.creatorName;
      base.maxPlayers = details.maxPlayers;
      base.visits = details.visits;
      base.playing = details.playing;
    } else if (detailsResult.status === 'rejected') {
      logger.warn(
        {
          placeId,
          universeId,
          error: detailsResult.reason instanceof Error ? detailsResult.reason.message : String(detailsResult.reason),
        },
        'Roblox game details lookup failed'
      );
    }

    if (iconResult.status === 'fulfilled') {
      base.iconUrl = iconResult.value;
    } else {
      logger.warn(
        {
          placeId,
          universeId,
          error: iconResult.reason instanceof Error ? iconResult.reason.message : String(iconResult.reason),
        },
        'Roblox game icon lookup failed'
      );
    }

    await this.upsertGame(base);

    logger.info(
      {
        placeId,
        universeId,
        hasName: Boolean(base.name),
        hasDescription: Boolean(base.description),
        hasIcon: Boolean(base.iconUrl),
      },
      'Resolved Roblox experience metadata'
    );

    return base;
  }

  private async getCachedGame(placeId: number): Promise<GamesRow | null> {
    const { data, error } = await this.supabase
      .from('games')
      .select('*')
      .eq('place_id', placeId)
      .maybeSingle<GamesRow>();

    if (error && error.code !== CACHE_MISS_CODE) {
      logger.warn(
        {
          placeId,
          error: error.message,
          code: error.code,
        },
        'Failed reading games cache row'
      );
      return null;
    }

    return data;
  }

  private isCompleteCacheHit(row: GamesRow): boolean {
    const hasName = Boolean(row.game_name && row.game_name.trim().length > 0);
    const hasIcon = Boolean(row.thumbnail_url && row.thumbnail_url.trim().length > 0);

    // game_description is optional in current schema. If absent, treat available fields as cache-complete.
    const hasDescriptionColumn = Object.prototype.hasOwnProperty.call(row, 'game_description');
    const hasDescription = !hasDescriptionColumn || Boolean(row.game_description && row.game_description.trim().length > 0);

    return hasName && hasIcon && hasDescription;
  }

  private async fetchUniverseId(placeId: number): Promise<number | null> {
    const url = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;

    try {
      const payload = await fetchJsonWithTimeoutRetry<UniverseLookupResponse>(url, {
        fetchFn: this.fetchFn,
        timeoutMs: 5000,
        retries: 1,
        init: {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
        },
        source: 'Roblox Universe API',
      });

      if (!Number.isInteger(payload.universeId) || payload.universeId <= 0) {
        return null;
      }

      return payload.universeId;
    } catch (error) {
      logger.warn(
        {
          placeId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Universe lookup request failed'
      );
      return null;
    }
  }

  private async fetchGameDetails(universeId: number): Promise<{
    name: string | null;
    description: string | null;
    creatorId: number | null;
    creatorName: string | null;
    maxPlayers: number | null;
    visits: number | null;
    playing: number | null;
  } | null> {
    const url = `https://games.roblox.com/v1/games?universeIds=${universeId}`;

    const payload = await fetchJsonWithTimeoutRetry<GameDetailsResponse>(url, {
      fetchFn: this.fetchFn,
      timeoutMs: 5000,
      retries: 1,
      init: {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      },
      source: 'Roblox Games API',
    });

    const first = payload.data?.[0];
    if (!first) {
      return null;
    }

    return {
      name: typeof first.name === 'string' && first.name.trim().length > 0 ? first.name.trim() : null,
      description: typeof first.description === 'string' && first.description.trim().length > 0
        ? first.description.trim()
        : null,
      creatorId: Number.isInteger(first.creator?.id) ? (first.creator?.id as number) : null,
      creatorName: typeof first.creator?.name === 'string' && first.creator.name.trim().length > 0
        ? first.creator.name.trim()
        : null,
      maxPlayers: Number.isInteger(first.maxPlayers) ? (first.maxPlayers as number) : null,
      visits: Number.isFinite(first.visits as number) ? (first.visits as number) : null,
      playing: Number.isFinite(first.playing as number) ? (first.playing as number) : null,
    };
  }

  private async fetchGameIcon(universeId: number): Promise<string | null> {
    const url = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=256x256&format=Png&isCircular=false`;

    const payload = await fetchJsonWithTimeoutRetry<GameIconResponse>(url, {
      fetchFn: this.fetchFn,
      timeoutMs: 5000,
      retries: 1,
      init: {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      },
      source: 'Roblox Thumbnails API',
    });

    const first = payload.data?.[0];
    if (!first || first.state !== 'Completed') {
      return null;
    }

    return first.imageUrl;
  }

  private async upsertGame(resolved: ResolvedExperience): Promise<void> {
    const basePayload: Record<string, unknown> = {
      place_id: resolved.placeId,
      canonical_web_url: resolved.canonicalWebUrl,
      canonical_start_url: resolved.canonicalStartUrl,
      game_name: resolved.name,
      thumbnail_url: resolved.iconUrl,
      updated_at: new Date().toISOString(),
    };

    const extendedPayload: Record<string, unknown> = {
      ...basePayload,
      game_description: resolved.description,
      max_players: resolved.maxPlayers,
      creator_id: resolved.creatorId,
      creator_name: resolved.creatorName,
    };

    // NOTE: Some deployments may not yet have game_description/max_players/creator_* columns.
    // We attempt extended upsert first, then gracefully fall back to the known-safe payload.
    const primary = await this.supabase.from('games').upsert(extendedPayload, {
      onConflict: 'place_id',
      ignoreDuplicates: false,
    });

    if (!primary.error) {
      return;
    }

    const isMissingColumn = /column .* does not exist|schema cache/i.test(primary.error.message ?? '');
    if (!isMissingColumn) {
      logger.error(
        {
          placeId: resolved.placeId,
          error: primary.error.message,
        },
        'Failed to upsert Roblox experience metadata'
      );
      return;
    }

    const fallback = await this.supabase.from('games').upsert(basePayload, {
      onConflict: 'place_id',
      ignoreDuplicates: false,
    });

    if (fallback.error) {
      logger.error(
        {
          placeId: resolved.placeId,
          error: fallback.error.message,
        },
        'Failed to upsert fallback Roblox experience metadata'
      );
      return;
    }

    logger.info(
      {
        placeId: resolved.placeId,
      },
      'Upserted Roblox experience metadata using fallback schema payload'
    );
  }
}

export async function resolveExperienceByPlaceId(placeId: number): Promise<ResolvedExperience> {
  const service = new RobloxExperienceResolverService();
  return service.resolveExperienceByPlaceId(placeId);
}
