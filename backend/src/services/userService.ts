import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { RobloxThumbnailService } from './robloxThumbnail.js';

export interface AppUser {
  id: string;
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName: string | null;
  robloxProfileUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  avatarHeadshotUrl: string | null;
  avatarCachedAt: string | null;
}

export interface UpsertUserInput {
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName?: string;
  robloxProfileUrl?: string;
}

export class UserService {
  private thumbnailService: RobloxThumbnailService;
  private readonly AVATAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.thumbnailService = new RobloxThumbnailService();
  }

  async upsertUser(input: UpsertUserInput): Promise<AppUser> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('app_users')
      .upsert(
        {
          roblox_user_id: input.robloxUserId,
          roblox_username: input.robloxUsername,
          roblox_display_name: input.robloxDisplayName || null,
          roblox_profile_url: input.robloxProfileUrl || null,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'roblox_user_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to upsert user: ${error.message}`);
    }

    return {
      id: data.id,
      robloxUserId: data.roblox_user_id,
      robloxUsername: data.roblox_username,
      robloxDisplayName: data.roblox_display_name,
      robloxProfileUrl: data.roblox_profile_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastLoginAt: data.last_login_at,
      avatarHeadshotUrl: data.avatar_headshot_url,
      avatarCachedAt: data.avatar_cached_at,
    };
  }

  async getUserById(id: string): Promise<AppUser | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('app_users')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get user: ${error.message}`);
    }

    return {
      id: data.id,
      robloxUserId: data.roblox_user_id,
      robloxUsername: data.roblox_username,
      robloxDisplayName: data.roblox_display_name,
      robloxProfileUrl: data.roblox_profile_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastLoginAt: data.last_login_at,
      avatarHeadshotUrl: data.avatar_headshot_url,
      avatarCachedAt: data.avatar_cached_at,
    };
  }

  /**
   * Get user's avatar headshot URL with caching
   * Fetches from cache if available and fresh (< 24 hours old)
   * Otherwise fetches from Roblox and updates cache
   * Falls back to cached value if Roblox fetch fails
   */
  async getAvatarHeadshotUrl(userId: string, robloxUserId: string): Promise<string | null> {
    const supabase = getSupabase();

    // Get current cache state
    const { data: userData } = await supabase
      .from('app_users')
      .select('avatar_headshot_url, avatar_cached_at')
      .eq('id', userId)
      .single();

    const cachedUrl = userData?.avatar_headshot_url || null;
    const cachedAt = userData?.avatar_cached_at ? new Date(userData.avatar_cached_at) : null;

    // Check if cache is fresh
    const now = new Date();
    const isCacheFresh = cachedAt && (now.getTime() - cachedAt.getTime() < this.AVATAR_CACHE_TTL_MS);

    if (isCacheFresh && cachedUrl) {
      return cachedUrl;
    }

    // Cache is stale or missing - fetch from Roblox
    try {
      const freshUrl = await this.thumbnailService.getUserAvatarHeadshot(robloxUserId);

      // Only update cache if we got a non-null URL
      if (freshUrl) {
        await supabase
          .from('app_users')
          .update({
            avatar_headshot_url: freshUrl,
            avatar_cached_at: now.toISOString(),
          })
          .eq('id', userId);

        return freshUrl;
      }

      // If Roblox returned null but we have a cached URL, keep using it
      return cachedUrl;
    } catch (error) {
      // On error, fall back to cached URL if available
      // This ensures we don't lose the avatar on temporary API failures
      return cachedUrl;
    }
  }
}
