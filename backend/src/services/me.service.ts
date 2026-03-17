import type { FastifyInstance } from 'fastify';
import { AVATAR_CACHE_TTL_MS } from '../config/cache.js';
import { isCompetitiveDepthEnabled } from '../config/featureFlags.js';
import { getPool } from '../db/pool.js';
import { getProvider } from '../db/provider.js';
import { createUserPlatformRepository, createUserRepository } from '../db/repository-factory.js';
import { RankingService, type SkillTier } from './rankingService.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { fetchJsonWithTimeoutRetry } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../plugins/metrics.js';

interface RobloxHeadshotApiResponse {
  data: Array<{
    targetId: number;
    state: string;
    imageUrl: string | null;
  }>;
}

interface MeDataResponse {
  appUser: {
    id: string;
    email: string | null; // Not available in Roblox OAuth
    displayName: string;
  };
  roblox: {
    connected: boolean;
    robloxUserId: string | null;
    username: string | null;
    displayName: string | null;
    avatarHeadshotUrl: string | null;
    verifiedAt: string | null;
  };
  competitive?: {
    rating: number;
    tier: SkillTier;
    currentSeasonNumber: number | null;
    seasonEndsAt: string | null;
    badges: Array<{
      seasonNumber: number;
      finalRating: number;
      tier: SkillTier;
    }>;
  };
}

interface UserRankingRow {
  rating: number;
}

interface ActiveSeasonRow {
  season_number: number;
  end_date: string;
}

interface SeasonBadgeRow {
  final_rating: number;
  seasons: {
    season_number: number;
  } | Array<{
    season_number: number;
  }> | null;
}

interface PgSeasonBadgeRow {
  final_rating: number;
  season_number: number;
}

/**
 * Fetch Roblox avatar headshot from thumbnails API
 * @param robloxUserId - Roblox user ID (as string)
 * @returns Avatar headshot URL or null
 */
export async function fetchRobloxHeadshot(robloxUserId: string): Promise<string | null> {
  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxUserId}&size=150x150&format=Png&isCircular=false`;

    const response = await fetchJsonWithTimeoutRetry<RobloxHeadshotApiResponse>(url, {
      timeoutMs: 5000,
      retries: 1,
      source: 'Roblox Thumbnails API',
    });

    const avatarData = response.data?.[0];
    if (avatarData?.state === 'Completed' && avatarData.imageUrl) {
      return avatarData.imageUrl;
    }

    return null;
  } catch (error) {
    // Log but don't throw - avatar fetch is non-critical
    logger.warn(
      { robloxUserId, error: error instanceof Error ? error.message : String(error) },
      'Failed to fetch Roblox avatar'
    );
    return null;
  }
}

/**
 * Update app_users avatar cache columns.
 */
export async function updateAppUserAvatarCache(
  userId: string,
  avatarUrl: string
): Promise<void> {
  await createUserRepository().updateById(userId, {
    avatarHeadshotUrl: avatarUrl,
    avatarCachedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Silently ignore errors - caching is best-effort
}

export function isAvatarCacheFresh(cachedAt: string | null): boolean {
  if (!cachedAt) {
    return false;
  }

  const ageMs = Date.now() - new Date(cachedAt).getTime();
  // ageMs < 0 means cachedAt is in the future (clock skew between app server and DB writer).
  // We treat this as stale to avoid trusting a potentially corrupted timestamp.
  // A large skew could cause all cached avatars to appear stale simultaneously,
  // triggering a Roblox API request storm until clocks re-synchronize.
  return ageMs >= 0 && ageMs < AVATAR_CACHE_TTL_MS;
}

async function getCompetitiveDataSupabase(userId: string): Promise<MeDataResponse['competitive']> {
  const supabase = (await import('../config/supabase.js')).getSupabase();

  const { data: rankingRow, error: rankingError } = await supabase
    .from('user_rankings')
    .select('rating')
    .eq('user_id', userId)
    .maybeSingle<UserRankingRow>();

  if (rankingError) {
    throw new AppError(
      ErrorCodes.INTERNAL_DB_ERROR,
      `Failed to fetch user ranking: ${rankingError.message}`,
      500
    );
  }

  const { data: activeSeason, error: seasonError } = await supabase
    .from('seasons')
    .select('season_number, end_date')
    .eq('is_active', true)
    .maybeSingle<ActiveSeasonRow>();

  if (seasonError && seasonError.code !== 'PGRST116') {
    throw new AppError(
      ErrorCodes.INTERNAL_DB_ERROR,
      `Failed to fetch active season: ${seasonError.message}`,
      500
    );
  }

  const { data: seasonBadges, error: badgeError } = await supabase
    .from('season_rankings')
    .select('final_rating, seasons(season_number)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5)
    .returns<SeasonBadgeRow[]>();

  if (badgeError) {
    throw new AppError(
      ErrorCodes.INTERNAL_DB_ERROR,
      `Failed to fetch season badges: ${badgeError.message}`,
      500
    );
  }

  const rating = rankingRow?.rating ?? 1000;
  return {
    rating,
    tier: RankingService.getTierFromRating(rating),
    currentSeasonNumber: activeSeason?.season_number ?? null,
    seasonEndsAt: activeSeason?.end_date ?? null,
    badges: (seasonBadges || [])
      .map((row) => {
        const season = Array.isArray(row.seasons) ? row.seasons[0] : row.seasons;
        if (!season?.season_number) {
          return null;
        }
        return {
          seasonNumber: Number(season.season_number),
          finalRating: Number(row.final_rating),
          tier: RankingService.getTierFromRating(Number(row.final_rating)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row)),
  };
}

async function getCompetitiveDataPg(userId: string): Promise<MeDataResponse['competitive']> {
  const pool = getPool();

  const [rankingResult, activeSeasonResult, seasonBadgesResult] = await Promise.all([
    pool.query<UserRankingRow>(
      `SELECT rating
       FROM user_rankings
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    ),
    pool.query<ActiveSeasonRow>(
      `SELECT season_number, end_date
       FROM seasons
       WHERE is_active = true
       LIMIT 1`
    ),
    pool.query<PgSeasonBadgeRow>(
      `SELECT sr.final_rating, s.season_number
       FROM season_rankings sr
       JOIN seasons s ON s.id = sr.season_id
       WHERE sr.user_id = $1
       ORDER BY sr.created_at DESC
       LIMIT 5`,
      [userId]
    ),
  ]);

  const rating = rankingResult.rows[0]?.rating ?? 1000;
  const activeSeason = activeSeasonResult.rows[0] ?? null;
  const seasonBadges = seasonBadgesResult.rows;

  return {
    rating,
    tier: RankingService.getTierFromRating(rating),
    currentSeasonNumber: activeSeason?.season_number ?? null,
    seasonEndsAt: activeSeason?.end_date ?? null,
    badges: seasonBadges
      .map((row) => ({
        seasonNumber: Number(row.season_number),
        finalRating: Number(row.final_rating),
        tier: RankingService.getTierFromRating(Number(row.final_rating)),
      }))
      .filter((row) => Number.isFinite(row.seasonNumber)),
  };
}

/**
 * Get user profile data with Roblox connection status
 */
export async function getMeData(
  userId: string,
  fastify: FastifyInstance
): Promise<MeDataResponse> {
  const userRepository = createUserRepository();
  const userPlatformRepository = createUserPlatformRepository();

  const { data: appUser, error: appUserError } = await userRepository.findById(userId);

  if (appUserError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to fetch user: ${appUserError.message}`
    );
  }

  if (!appUser) {
    throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'User not found');
  }

  const displayName =
    appUser.robloxDisplayName || appUser.robloxUsername || 'User';

  const { data: platformData, error: platformError } = await userPlatformRepository.findRobloxConnection(userId);

  if (platformError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to fetch platform connection: ${platformError.message}`
    );
  }

  const competitiveDepthEnabled = isCompetitiveDepthEnabled(fastify);

  const buildCompetitiveData = async (): Promise<MeDataResponse['competitive']> => {
    if (!competitiveDepthEnabled) {
      return undefined;
    }

    try {
      return getProvider() === 'postgres'
        ? await getCompetitiveDataPg(userId)
        : await getCompetitiveDataSupabase(userId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        error instanceof Error ? error.message : 'Failed to fetch competitive profile data',
        500
      );
    }
  };

  const competitive = await buildCompetitiveData();

  // If not connected, return early
  if (!platformData) {
    return {
      appUser: {
        id: userId,
        email: null,
        displayName,
      },
      roblox: {
        connected: false,
        robloxUserId: null,
        username: null,
        displayName: null,
        avatarHeadshotUrl: null,
        verifiedAt: null,
      },
      ...(competitiveDepthEnabled ? { competitive } : {}),
    };
  }

  let avatarHeadshotUrl: string | null = appUser.avatarHeadshotUrl ?? platformData.platform_avatar_url;

  const shouldFetchAvatar = !isAvatarCacheFresh(appUser.avatarCachedAt) || !appUser.avatarHeadshotUrl;
  metrics.incrementCounter(shouldFetchAvatar ? 'avatar_cache_misses_total' : 'avatar_cache_hits_total');
  if (shouldFetchAvatar) {
    const freshHeadshot = await fetchRobloxHeadshot(platformData.platform_user_id);
    if (freshHeadshot) {
      avatarHeadshotUrl = freshHeadshot;
      updateAppUserAvatarCache(userId, freshHeadshot).catch((err: unknown) =>
        logger.warn({ userId, error: err instanceof Error ? err.message : String(err) }, 'Avatar cache update failed')
      );
    }
  }

  return {
    appUser: {
      id: userId,
      email: null,
      displayName,
    },
    roblox: {
      connected: true,
      robloxUserId: platformData.platform_user_id,
      username: platformData.platform_username,
      displayName: platformData.platform_display_name,
      avatarHeadshotUrl,
      verifiedAt: platformData.verified_at,
    },
    ...(competitiveDepthEnabled ? { competitive } : {}),
  };
}
