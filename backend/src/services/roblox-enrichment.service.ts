/**
 * Roblox Game Enrichment Service
 *
 * Fetches game metadata from Roblox public APIs and caches in Supabase.
 * Uses only documented, public endpoints (no cookies required).
 *
 * Flow:
 * 1. Check if game data exists with name + thumbnail (cache hit)
 * 2. Fetch universeId from placeId
 * 3. Fetch game details using universeId
 * 4. Fetch game icon thumbnail
 * 5. Upsert enriched data into games table
 */

import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes, ExternalServiceError } from '../utils/errors.js';
import { logger } from '../lib/logger.js';
import { withRetry } from '../lib/errorRecovery.js';

export interface EnrichedGame {
  placeId: number;
  universeId: number;
  name: string;
  thumbnailUrl: string | null;
}

interface UniverseResponse {
  universeId: number;
}

interface GameDetailsResponse {
  data: Array<{
    id: number; // universeId
    name: string;
    description: string;
    creator: {
      id: number;
      name: string;
      type: string;
    };
    rootPlaceId: number;
    created: string;
    updated: string;
    placeVisits: number;
  }>;
}

interface ThumbnailResponse {
  data: Array<{
    targetId: number;
    state: string;
    imageUrl: string | null;
  }>;
}

export interface FetchFunction {
  (url: string, init?: RequestInit): Promise<Response>;
}

export class RobloxEnrichmentService {
  private readonly REQUEST_TIMEOUT = 5000; // 5 seconds
  private readonly RETRY_ATTEMPTS = 2; // 1 initial + 1 retry

  constructor(private fetchFn: FetchFunction = fetch) {}

  /**
   * Enrich game data by placeId
   * Returns partial data if some endpoints fail
   */
  async enrichGame(placeId: number): Promise<EnrichedGame> {
    if (!placeId || placeId <= 0) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid placeId: must be a positive integer',
        400
      );
    }

    logger.info({ placeId }, 'Starting game enrichment');

    // Check cache first
    const cached = await this.getCachedGame(placeId);
    if (cached) {
      logger.info({ placeId }, 'Cache hit: game already enriched');
      return cached;
    }

    // Fetch enrichment data
    const universeId = await this.fetchUniverseId(placeId);
    let name: string | null = null;
    let thumbnailUrl: string | null = null;

    // Fetch game details (name)
    try {
      name = await this.fetchGameName(universeId);
    } catch (error) {
      logger.warn(
        { placeId, universeId, error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch game name'
      );
    }

    // Fetch thumbnail (independent of name fetch)
    try {
      thumbnailUrl = await this.fetchGameThumbnail(placeId);
    } catch (error) {
      logger.warn(
        { placeId, error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch game thumbnail'
      );
    }

    // Upsert to database
    await this.upsertGame(placeId, name, thumbnailUrl);

    logger.info({ placeId, universeId, hasName: !!name, hasThumbnail: !!thumbnailUrl }, 'Game enrichment complete');

    return {
      placeId,
      universeId,
      name: name || `Place ${placeId}`,
      thumbnailUrl,
    };
  }

  /**
   * Check if game is already enriched in database
   */
  private async getCachedGame(placeId: number): Promise<EnrichedGame | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('games')
      .select('place_id, game_name, thumbnail_url')
      .eq('place_id', placeId)
      .single();

    if (error) {
      // Not found is OK, other errors should be logged
      if (error.code !== 'PGRST116') {
        logger.warn({ placeId, error: error.message }, 'Error checking game cache');
      }
      return null;
    }

    // Only use cache if we have both name and thumbnail
    if (data && data.game_name && data.thumbnail_url) {
      return {
        placeId: data.place_id,
        universeId: 0, // We don't store universeId, return placeholder
        name: data.game_name,
        thumbnailUrl: data.thumbnail_url,
      };
    }

    return null;
  }

  /**
   * Step 1: Get universeId from placeId
   * https://apis.roblox.com/universes/v1/places/{placeId}/universe
   */
  private async fetchUniverseId(placeId: number): Promise<number> {
    const url = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        try {
          const response = await this.fetchFn(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new AppError(
                ErrorCodes.NOT_FOUND,
                `Place ${placeId} not found on Roblox`,
                404
              );
            }
            throw new ExternalServiceError(
              'Roblox Universe API',
              `HTTP ${response.status}`
            );
          }

          const data = (await response.json()) as UniverseResponse;

          if (!data.universeId) {
            throw new ExternalServiceError(
              'Roblox Universe API',
              'Missing universeId in response'
            );
          }

          return data.universeId;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new ExternalServiceError('Roblox Universe API', 'Request timeout');
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxAttempts: this.RETRY_ATTEMPTS,
        baseDelayMs: 500,
        isRetryable: (error) => {
          // Retry on network errors and 5xx, but not 4xx
          if (error instanceof AppError) {
            return error.statusCode >= 500;
          }
          return true;
        },
      }
    );
  }

  /**
   * Step 2: Get game details (name) from universeId
   * https://games.roblox.com/v1/games?universeIds={universeId}
   */
  private async fetchGameName(universeId: number): Promise<string> {
    const url = `https://games.roblox.com/v1/games?universeIds=${universeId}`;

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        try {
          const response = await this.fetchFn(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new ExternalServiceError(
              'Roblox Games API',
              `HTTP ${response.status}`
            );
          }

          const data = (await response.json()) as GameDetailsResponse;

          if (!data.data || data.data.length === 0) {
            throw new ExternalServiceError(
              'Roblox Games API',
              'No game found for universeId'
            );
          }

          return data.data[0].name;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new ExternalServiceError('Roblox Games API', 'Request timeout');
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxAttempts: this.RETRY_ATTEMPTS,
        baseDelayMs: 500,
        isRetryable: (error) => {
          if (error instanceof AppError) {
            return error.statusCode >= 500;
          }
          return true;
        },
      }
    );
  }

  /**
   * Step 3: Get game icon thumbnail
   * https://thumbnails.roblox.com/v1/places/gameicons?placeIds={placeId}&size=256x256&format=Png&isCircular=false
   */
  private async fetchGameThumbnail(placeId: number): Promise<string | null> {
    const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=256x256&format=Png&isCircular=false`;

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        try {
          const response = await this.fetchFn(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new ExternalServiceError(
              'Roblox Thumbnails API',
              `HTTP ${response.status}`
            );
          }

          const data = (await response.json()) as ThumbnailResponse;

          if (!data.data || data.data.length === 0) {
            return null;
          }

          const thumbnail = data.data[0];

          // Roblox returns state: "Completed" when image is available
          if (thumbnail.state === 'Completed' && thumbnail.imageUrl) {
            return thumbnail.imageUrl;
          }

          return null;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new ExternalServiceError('Roblox Thumbnails API', 'Request timeout');
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxAttempts: this.RETRY_ATTEMPTS,
        baseDelayMs: 500,
        isRetryable: (error) => {
          if (error instanceof AppError) {
            return error.statusCode >= 500;
          }
          return true;
        },
      }
    );
  }

  /**
   * Upsert enriched game data to database
   */
  private async upsertGame(
    placeId: number,
    gameName: string | null,
    thumbnailUrl: string | null
  ): Promise<void> {
    const supabase = getSupabase();

    const payload: Record<string, unknown> = {
      place_id: placeId,
      updated_at: new Date().toISOString(),
    };

    if (gameName) {
      payload.game_name = gameName;
    }

    if (thumbnailUrl) {
      payload.thumbnail_url = thumbnailUrl;
    }

    const { error } = await supabase
      .from('games')
      .upsert(payload, {
        onConflict: 'place_id',
        ignoreDuplicates: false,
      });

    if (error) {
      logger.error(
        { placeId, error: error.message },
        'Failed to upsert game to database'
      );
      throw new AppError(
        ErrorCodes.INTERNAL_DATABASE,
        `Database error: ${error.message}`,
        500
      );
    }

    logger.debug({ placeId, hasName: !!gameName, hasThumbnail: !!thumbnailUrl }, 'Game upserted to database');
  }
}
