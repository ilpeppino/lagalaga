import { getSupabase } from '../config/supabase.js';
import { logger, logWithCorrelation } from '../lib/logger.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export interface ResolveExperienceResult {
  placeId: number;
  universeId: number;
  gameName: string;
  canonicalUrl: string;
  // Backward compatibility for existing consumers
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

interface RobloxGameMetadata {
  placeId: number;
  universeId: number;
  gameName: string;
  canonicalUrl: string;
  description?: string;
  creatorName?: string;
}

interface ResolveShareOptions {
  fetchFn?: typeof fetch;
  correlationId?: string;
}

const RESOLVE_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class RobloxExperienceResolverService {
  async resolveExperienceFromUrl(url: string, correlationId?: string): Promise<ResolveExperienceResult> {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      throw new AppError('NOT_FOUND_RESOURCE', 'Could not resolve Roblox share link', 404, {
        severity: 'warning',
      });
    }

    const preParsedPlaceId = extractPlaceIdFromString(trimmedUrl);
    const cached = preParsedPlaceId
      ? await this.getBestCachedEntry(trimmedUrl, String(preParsedPlaceId))
      : await this.getCacheByUrl(trimmedUrl);

    if (cached && this.isFresh(cached.updated_at)) {
      return this.toResponse(cached);
    }

    try {
      const resolved = await resolveRobloxShareUrl(trimmedUrl, { correlationId });

      await this.upsertCache(trimmedUrl, {
        placeId: resolved.placeId,
        universeId: resolved.universeId,
        gameName: resolved.gameName,
      });

      return {
        placeId: resolved.placeId,
        universeId: resolved.universeId,
        gameName: resolved.gameName,
        canonicalUrl: resolved.canonicalUrl,
        name: resolved.gameName,
      };
    } catch (error) {
      logWithCorrelation(
        'warn',
        {
          url: trimmedUrl,
          error: error instanceof Error ? error.message : String(error),
        },
        'Roblox share URL resolution failed',
        undefined,
        correlationId
      );

      if (cached) {
        return this.toResponse(cached);
      }

      if (error instanceof ShareLookupHttpError && error.statusCode === 429) {
        throw new AppError(
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          'Roblox share link is temporarily rate limited. Please retry shortly.',
          429,
          { severity: 'warning' }
        );
      }

      throw new AppError('NOT_FOUND_RESOURCE', 'Could not resolve Roblox share link', 404, {
        severity: 'warning',
      });
    }
  }

  private async getCacheByUrl(url: string): Promise<CacheRow | null> {
    const supabase = getSupabase();

    const result = await supabase
      .from('roblox_experience_cache')
      .select('platform_key,url,place_id,universe_id,name,updated_at')
      .eq('platform_key', 'roblox')
      .eq('url', url)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<CacheRow>();

    if (result.error) {
      logger.warn({ error: result.error.message, url }, 'Failed to read roblox_experience_cache by url');
      return null;
    }

    return result.data ?? null;
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

  private async upsertCache(
    url: string,
    resolved: { placeId: number; universeId: number; gameName: string }
  ): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('roblox_experience_cache')
      .upsert(
        {
          platform_key: 'roblox',
          url,
          place_id: String(resolved.placeId),
          universe_id: String(resolved.universeId),
          name: resolved.gameName,
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
    const parsedPlaceId = Number.parseInt(row.place_id, 10);
    const parsedUniverseId = row.universe_id ? Number.parseInt(row.universe_id, 10) : Number.NaN;

    return {
      placeId: Number.isNaN(parsedPlaceId) ? 0 : parsedPlaceId,
      universeId: Number.isNaN(parsedUniverseId) ? 0 : parsedUniverseId,
      gameName: row.name ?? 'Roblox Experience',
      canonicalUrl: Number.isNaN(parsedPlaceId)
        ? row.url
        : `https://www.roblox.com/games/${parsedPlaceId}`,
      name: row.name ?? 'Roblox Experience',
    };
  }
}

export async function resolveRobloxShareUrl(
  rawUrl: string,
  options: ResolveShareOptions = {}
): Promise<RobloxGameMetadata> {
  const fetchFn = options.fetchFn ?? fetch;
  const parsed = parseRobloxInputUrl(rawUrl);
  const correlationId = options.correlationId;

  let canonicalUrl: string;
  let placeId: number | null;

  if (parsed.protocol === 'roblox:') {
    placeId = extractPlaceIdFromUrl(parsed) ?? extractPlaceIdFromString(rawUrl);
    if (!placeId) {
      throw new Error('No placeId found in Roblox deeplink');
    }
    canonicalUrl = `https://www.roblox.com/games/${placeId}`;
  } else {
    const host = parsed.hostname.toLowerCase();
    if (!['www.roblox.com', 'roblox.com'].includes(host)) {
      throw new Error('Unsupported Roblox host');
    }

    placeId = extractPlaceIdFromUrl(parsed);
    if (placeId) {
      canonicalUrl = `https://www.roblox.com/games/${placeId}`;
    } else if (isSharePath(parsed.pathname)) {
      const shareCandidates = buildShareUrlCandidates(parsed);
      logWithCorrelation('info', { shareCandidates }, 'Prepared Roblox share URL candidates', undefined, correlationId);

      let lastError: unknown = null;
      let shareResolution: { placeId: number; canonicalUrl: string } | null = null;

      for (const candidate of shareCandidates) {
        try {
          shareResolution = await resolvePlaceIdFromShareUrl(candidate, fetchFn, correlationId);
          break;
        } catch (error) {
          lastError = error;
          logWithCorrelation(
            'warn',
            {
              candidate,
              error: error instanceof Error ? error.message : String(error),
            },
            'Roblox share URL candidate failed',
            undefined,
            correlationId
          );
        }
      }

      if (!shareResolution) {
        throw lastError instanceof Error ? lastError : new Error('Could not resolve share URL from candidates');
      }

      placeId = shareResolution.placeId;
      canonicalUrl = shareResolution.canonicalUrl;
    } else {
      throw new Error('No placeId found in URL');
    }
  }

  if (!placeId) {
    throw new Error('Failed to resolve placeId');
  }

  const universeId = await resolveUniverseId(placeId, fetchFn);
  logWithCorrelation(
    'info',
    { placeId, universeId },
    'Resolved Roblox universeId',
    undefined,
    correlationId
  );

  const gameDetails = await resolveGameDetails(universeId, fetchFn);
  logWithCorrelation(
    'info',
    {
      placeId,
      universeId,
      gameName: gameDetails.name,
    },
    'Resolved Roblox game metadata',
    undefined,
    correlationId
  );

  return {
    placeId,
    universeId,
    gameName: gameDetails.name,
    canonicalUrl,
    description: gameDetails.description,
    creatorName: gameDetails.creator?.name,
  };
}

function isSharePath(pathname: string): boolean {
  return pathname === '/share' || pathname === '/share-links';
}

function parseRobloxInputUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Empty URL');
  }

  if (trimmed.startsWith('roblox://')) {
    return new URL(trimmed);
  }

  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return new URL(withScheme);
}

function buildShareUrlCandidates(url: URL): string[] {
  const shareLinksUrl = new URL('https://www.roblox.com/share-links');
  const shareUrl = new URL('https://www.roblox.com/share');
  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type');
  const stamp = url.searchParams.get('stamp');

  if (code) {
    shareLinksUrl.searchParams.set('code', code);
    shareUrl.searchParams.set('code', code);
  }
  if (type) {
    shareLinksUrl.searchParams.set('type', type);
    shareUrl.searchParams.set('type', type);
  }
  if (stamp) {
    shareUrl.searchParams.set('stamp', stamp);
  }

  // Prioritize path form the caller provided, then try the alternate.
  const preferred = url.pathname === '/share' ? shareUrl.toString() : shareLinksUrl.toString();
  const alternate = url.pathname === '/share' ? shareLinksUrl.toString() : shareUrl.toString();

  return preferred === alternate ? [preferred] : [preferred, alternate];
}

async function resolvePlaceIdFromShareUrl(
  normalizedShareUrl: string,
  fetchFn: typeof fetch,
  correlationId?: string
): Promise<{ placeId: number; canonicalUrl: string }> {
  let currentUrl = normalizedShareUrl;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchTextResponseWithTimeout(currentUrl, fetchFn);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Share URL redirect missing Location header');
      }

      const redirectedUrl = new URL(location, currentUrl);
      logWithCorrelation(
        'info',
        {
          from: currentUrl,
          to: redirectedUrl.toString(),
          status: response.status,
        },
        'Detected Roblox share redirect',
        undefined,
        correlationId
      );

      const redirectHost = redirectedUrl.hostname.toLowerCase();
      if (!['www.roblox.com', 'roblox.com'].includes(redirectHost)) {
        throw new Error(`Unexpected redirect host: ${redirectHost}`);
      }

      const redirectPlaceId = extractPlaceIdFromUrl(redirectedUrl);
      if (redirectPlaceId) {
        return {
          placeId: redirectPlaceId,
          canonicalUrl: `https://www.roblox.com/games/${redirectPlaceId}`,
        };
      }

      currentUrl = redirectedUrl.toString();
      continue;
    }

    if (!response.ok) {
      throw new ShareLookupHttpError(response.status, currentUrl);
    }

    const html = await response.text();
    const parsed = extractCanonicalAndPlaceIdFromHtml(html);

    if (parsed.placeId) {
      return {
        placeId: parsed.placeId,
        canonicalUrl: parsed.canonicalUrl ?? `https://www.roblox.com/games/${parsed.placeId}`,
      };
    }

    throw new Error('Could not extract placeId from share page HTML');
  }

  throw new Error('Could not resolve share URL to placeId');
}

class ShareLookupHttpError extends Error {
  constructor(public readonly statusCode: number, public readonly requestedUrl: string) {
    super(`Share URL returned HTTP ${statusCode}`);
    this.name = 'ShareLookupHttpError';
  }
}

function extractCanonicalAndPlaceIdFromHtml(html: string): {
  placeId: number | null;
  canonicalUrl: string | null;
} {
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);

  const canonicalCandidate = canonicalMatch?.[1] ?? ogUrlMatch?.[1] ?? null;
  if (canonicalCandidate) {
    const parsedCandidate = safeParseUrl(canonicalCandidate);
    const placeIdFromCanonical = parsedCandidate ? extractPlaceIdFromUrl(parsedCandidate) : null;
    if (placeIdFromCanonical) {
      return {
        placeId: placeIdFromCanonical,
        canonicalUrl: `https://www.roblox.com/games/${placeIdFromCanonical}`,
      };
    }
  }

  const gameLinkMatch = html.match(/https?:\/\/(?:www\.)?roblox\.com\/games\/(\d+)[^"'\s<]*/i);
  if (gameLinkMatch?.[1]) {
    const placeId = Number.parseInt(gameLinkMatch[1], 10);
    if (!Number.isNaN(placeId) && placeId > 0) {
      return {
        placeId,
        canonicalUrl: `https://www.roblox.com/games/${placeId}`,
      };
    }
  }

  return { placeId: null, canonicalUrl: null };
}

function extractPlaceIdFromUrl(url: URL): number | null {
  const pathMatch = url.pathname.match(/^\/games\/(\d+)/i);
  if (pathMatch?.[1]) {
    const placeId = Number.parseInt(pathMatch[1], 10);
    if (!Number.isNaN(placeId) && placeId > 0) {
      return placeId;
    }
  }

  const placeIdParam = url.searchParams.get('placeId') ?? url.searchParams.get('gameId');
  if (placeIdParam && /^\d+$/.test(placeIdParam)) {
    const placeId = Number.parseInt(placeIdParam, 10);
    return placeId > 0 ? placeId : null;
  }

  return null;
}

function extractPlaceIdFromString(value: string): number | null {
  const match = value.match(/(?:\/games\/|placeId=|gameId=)(\d+)/i);
  if (!match?.[1]) {
    return null;
  }

  const placeId = Number.parseInt(match[1], 10);
  return Number.isNaN(placeId) || placeId <= 0 ? null : placeId;
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

async function resolveUniverseId(placeId: number, fetchFn: typeof fetch): Promise<number> {
  const universeUrl = `https://apis.roblox.com/universes/v1/places/${encodeURIComponent(String(placeId))}/universe`;
  const payload = await fetchJsonWithTimeout(universeUrl, fetchFn);
  const universeId = payload?.universeId;

  if (typeof universeId !== 'number' || !Number.isFinite(universeId) || universeId <= 0) {
    throw new Error('Universe ID missing or invalid in Roblox universe response');
  }

  return universeId;
}

async function resolveGameDetails(
  universeId: number,
  fetchFn: typeof fetch
): Promise<{
  name: string;
  description?: string;
  rootPlaceId?: number;
  creator?: { id?: number; name?: string; type?: string };
}> {
  const gamesUrl = `https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(String(universeId))}`;
  const payload = await fetchJsonWithTimeout(gamesUrl, fetchFn);

  if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error('Roblox games response is empty');
  }

  const game = payload.data[0];
  if (!game || typeof game.name !== 'string' || !game.name.trim()) {
    throw new Error('Experience name missing in Roblox games response');
  }

  return {
    name: game.name.trim(),
    description: typeof game.description === 'string' ? game.description : undefined,
    rootPlaceId: typeof game.rootPlaceId === 'number' ? game.rootPlaceId : undefined,
    creator: game.creator,
  };
}

async function fetchJsonWithTimeout(url: string, fetchFn: typeof fetch): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, {
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

async function fetchTextResponseWithTimeout(url: string, fetchFn: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    return await fetchFn(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'lagalaga-backend/1.0',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
