import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { ExternalServiceError, ValidationError } from '../utils/errors.js';

interface ResolveExperienceResult {
  placeId?: string;
  universeId?: string;
  name?: string;
}

interface CacheRow {
  platform_key: string;
  url: string;
  place_id: string;
  universe_id: string | null;
  name: string | null;
  updated_at: string;
}

const RESOLVE_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class RobloxExperienceResolverService {
  async resolveExperienceFromUrl(url: string): Promise<ResolveExperienceResult> {
    const trimmedUrl = url.trim();
    const placeId = this.extractPlaceId(trimmedUrl);

    if (!placeId) {
      throw new ValidationError('Could not find a Roblox placeId in URL. Expected /games/<placeId>.');
    }

    const cached = await this.getBestCachedEntry(trimmedUrl, placeId);
    if (cached && this.isFresh(cached.updated_at)) {
      return this.toResponse(cached);
    }

    try {
      const universeId = await this.resolveUniverseId(placeId);
      const name = await this.resolveExperienceName(universeId);

      const resolved: ResolveExperienceResult = {
        placeId,
        universeId,
        name,
      };

      await this.upsertCache(trimmedUrl, resolved);
      return resolved;
    } catch (error) {
      logger.warn(
        {
          url: trimmedUrl,
          placeId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to resolve Roblox experience from upstream APIs'
      );

      if (cached) {
        return this.toResponse(cached);
      }

      throw new ExternalServiceError('Roblox', 'Could not resolve experience metadata right now');
    }
  }

  private async getBestCachedEntry(url: string, placeId: string): Promise<CacheRow | null> {
    const supabase = getSupabase();

    const [byUrl, byPlace] = await Promise.all([
      supabase
        .from('roblox_experience_cache')
        .select('platform_key,url,place_id,universe_id,name,updated_at')
        .eq('platform_key', 'roblox')
        .eq('url', url)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<CacheRow>(),
      supabase
        .from('roblox_experience_cache')
        .select('platform_key,url,place_id,universe_id,name,updated_at')
        .eq('platform_key', 'roblox')
        .eq('place_id', placeId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<CacheRow>(),
    ]);

    const urlRow = byUrl.error ? null : (byUrl.data ?? null);
    const placeRow = byPlace.error ? null : (byPlace.data ?? null);

    if (byUrl.error) {
      logger.warn({ error: byUrl.error.message, url }, 'Failed to read roblox_experience_cache by url');
    }
    if (byPlace.error) {
      logger.warn({ error: byPlace.error.message, placeId }, 'Failed to read roblox_experience_cache by placeId');
    }

    if (!urlRow) return placeRow;
    if (!placeRow) return urlRow;

    return Date.parse(urlRow.updated_at) >= Date.parse(placeRow.updated_at) ? urlRow : placeRow;
  }

  private async upsertCache(url: string, resolved: ResolveExperienceResult): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('roblox_experience_cache')
      .upsert(
        {
          platform_key: 'roblox',
          url,
          place_id: resolved.placeId,
          universe_id: resolved.universeId,
          name: resolved.name,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'url',
          ignoreDuplicates: false,
        }
      );

    if (error) {
      logger.warn({ error: error.message, url, placeId: resolved.placeId }, 'Failed to upsert roblox_experience_cache');
    }
  }

  private isFresh(updatedAt: string): boolean {
    const updatedAtMs = Date.parse(updatedAt);
    if (Number.isNaN(updatedAtMs)) {
      return false;
    }

    return Date.now() - updatedAtMs <= CACHE_TTL_MS;
  }

  private toResponse(row: CacheRow): ResolveExperienceResult {
    return {
      placeId: row.place_id,
      universeId: row.universe_id ?? undefined,
      name: row.name ?? undefined,
    };
  }

  private extractPlaceId(rawUrl: string): string | null {
    if (!rawUrl) {
      return null;
    }

    const normalizedUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`;

    try {
      const parsed = new URL(normalizedUrl);
      const host = parsed.hostname.toLowerCase();
      if (!(host === 'www.roblox.com' || host === 'roblox.com')) {
        return null;
      }

      const pathMatch = parsed.pathname.match(/\/games\/(\d+)/i);
      return pathMatch?.[1] ?? null;
    } catch {
      const fallbackMatch = rawUrl.match(/(?:https?:\/\/)?(?:www\.)?roblox\.com\/games\/(\d+)/i);
      return fallbackMatch?.[1] ?? null;
    }
  }

  private async resolveUniverseId(placeId: string): Promise<string> {
    const detailsUrl = `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${encodeURIComponent(placeId)}`;
    const payload = await this.fetchJsonWithTimeout(detailsUrl);

    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error('Roblox place details response is empty');
    }

    const universeId = payload[0]?.universeId;
    if (universeId === undefined || universeId === null) {
      throw new Error('Universe ID missing in Roblox place details response');
    }

    return String(universeId);
  }

  private async resolveExperienceName(universeId: string): Promise<string> {
    const gamesUrl = `https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`;
    const payload = await this.fetchJsonWithTimeout(gamesUrl);

    if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) {
      throw new Error('Roblox games response is empty');
    }

    const name = payload.data[0]?.name;
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Experience name missing in Roblox games response');
    }

    return name.trim();
  }

  private async fetchJsonWithTimeout(url: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'lagalaga-backend/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Roblox API responded with ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
