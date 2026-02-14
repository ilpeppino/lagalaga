import type { FastifyInstance } from 'fastify';
import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { fetchJsonWithTimeoutRetry } from '../lib/http.js';

interface RobloxHeadshotApiResponse {
  data: Array<{
    targetId: number;
    state: string;
    imageUrl: string | null;
  }>;
}

interface UserPlatformRow {
  user_id: string;
  platform_id: string;
  platform_user_id: string;
  platform_username: string | null;
  platform_display_name: string | null;
  platform_avatar_url: string | null;
  verified_at: string | null;
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
}

/**
 * Fetch Roblox avatar headshot from thumbnails API
 * @param robloxUserId - Roblox user ID (as string)
 * @returns Avatar headshot URL or null
 */
async function fetchRobloxHeadshot(robloxUserId: string): Promise<string | null> {
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
    console.warn(`Failed to fetch Roblox headshot for user ${robloxUserId}:`, error);
    return null;
  }
}

/**
 * Update platform_avatar_url in user_platforms table
 */
async function updatePlatformAvatarUrl(
  userId: string,
  avatarUrl: string
): Promise<void> {
  const supabase = getSupabase();

  await supabase
    .from('user_platforms')
    .update({
      platform_avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform_id', 'roblox');

  // Silently ignore errors - caching is best-effort
}

/**
 * Get user profile data with Roblox connection status
 */
export async function getMeData(
  userId: string,
  _fastify: FastifyInstance
): Promise<MeDataResponse> {
  const supabase = getSupabase();

  // Fetch app_users row
  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('id, roblox_username, roblox_display_name')
    .eq('id', userId)
    .maybeSingle();

  if (appUserError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to fetch user: ${appUserError.message}`
    );
  }

  if (!appUser) {
    throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'User not found');
  }

  // Use displayName if available, else fallback to username
  const displayName =
    appUser.roblox_display_name || appUser.roblox_username || 'User';

  // Query user_platforms for Roblox connection
  const { data: platformData, error: platformError } = await supabase
    .from('user_platforms')
    .select(
      'user_id, platform_id, platform_user_id, platform_username, platform_display_name, platform_avatar_url, verified_at'
    )
    .eq('user_id', userId)
    .eq('platform_id', 'roblox')
    .maybeSingle<UserPlatformRow>();

  if (platformError && platformError.code !== 'PGRST116') {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to fetch platform connection: ${platformError.message}`
    );
  }

  // If not connected, return early
  if (!platformData) {
    return {
      appUser: {
        id: userId,
        email: null, // Not available with Roblox OAuth
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
    };
  }

  // User is connected - fetch avatar headshot
  let avatarHeadshotUrl: string | null = platformData.platform_avatar_url;

  // Fetch fresh headshot from Roblox API
  const freshHeadshot = await fetchRobloxHeadshot(platformData.platform_user_id);
  if (freshHeadshot) {
    avatarHeadshotUrl = freshHeadshot;
    // Update cache asynchronously (best-effort)
    void updatePlatformAvatarUrl(userId, freshHeadshot);
  }

  return {
    appUser: {
      id: userId,
      email: null, // Not available with Roblox OAuth
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
  };
}
