import { getSupabase } from '../config/supabase.js';
import { AVATAR_CACHE_TTL_MS } from '../config/cache.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { RobloxThumbnailService } from './robloxThumbnail.js';

export interface AppUser {
  id: string;
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName: string | null;
  robloxProfileUrl: string | null;
  authProvider: 'ROBLOX' | 'APPLE' | 'GOOGLE';
  appleSub: string | null;
  appleEmail: string | null;
  appleEmailIsPrivate: boolean;
  appleFullName: string | null;
  googleSub: string | null;
  googleEmail: string | null;
  googleEmailVerified: boolean;
  googleFullName: string | null;
  status: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  tokenVersion: number;
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

export interface UpsertAppleUserInput {
  appleSub: string;
  email?: string | null;
  fullName?: string | null;
  isPrivateEmail?: boolean;
}

export interface UpsertGoogleUserInput {
  googleSub: string;
  email?: string | null;
  fullName?: string | null;
  emailVerified?: boolean;
}

export class UserService {
  private thumbnailService: RobloxThumbnailService;

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
          auth_provider: 'ROBLOX',
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
      authProvider: data.auth_provider ?? 'ROBLOX',
      appleSub: data.apple_sub ?? null,
      appleEmail: data.apple_email ?? null,
      appleEmailIsPrivate: Boolean(data.apple_email_is_private),
      appleFullName: data.apple_full_name ?? null,
      googleSub: data.google_sub ?? null,
      googleEmail: data.google_email ?? null,
      googleEmailVerified: Boolean(data.google_email_verified),
      googleFullName: data.google_full_name ?? null,
      status: data.status,
      tokenVersion: data.token_version ?? 0,
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
      authProvider: data.auth_provider ?? 'ROBLOX',
      appleSub: data.apple_sub ?? null,
      appleEmail: data.apple_email ?? null,
      appleEmailIsPrivate: Boolean(data.apple_email_is_private),
      appleFullName: data.apple_full_name ?? null,
      googleSub: data.google_sub ?? null,
      googleEmail: data.google_email ?? null,
      googleEmailVerified: Boolean(data.google_email_verified),
      googleFullName: data.google_full_name ?? null,
      status: data.status,
      tokenVersion: data.token_version ?? 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastLoginAt: data.last_login_at,
      avatarHeadshotUrl: data.avatar_headshot_url,
      avatarCachedAt: data.avatar_cached_at,
    };
  }

  async upsertAppleUser(input: UpsertAppleUserInput): Promise<AppUser> {
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from('app_users')
      .select()
      .eq('apple_sub', input.appleSub)
      .maybeSingle();

    if (existingError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to load Apple user: ${existingError.message}`);
    }

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        auth_provider: 'APPLE',
        updated_at: nowIso,
        last_login_at: nowIso,
      };
      if (input.email) {
        updatePayload.apple_email = input.email;
      }
      if (typeof input.isPrivateEmail === 'boolean') {
        updatePayload.apple_email_is_private = input.isPrivateEmail;
      }
      if (input.fullName) {
        updatePayload.apple_full_name = input.fullName;
      }

      const { data: updated, error: updateError } = await supabase
        .from('app_users')
        .update(updatePayload)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to update Apple user: ${updateError.message}`);
      }

      return {
        id: updated.id,
        robloxUserId: updated.roblox_user_id,
        robloxUsername: updated.roblox_username,
        robloxDisplayName: updated.roblox_display_name,
        robloxProfileUrl: updated.roblox_profile_url,
        authProvider: updated.auth_provider ?? 'APPLE',
        appleSub: updated.apple_sub ?? null,
        appleEmail: updated.apple_email ?? null,
        appleEmailIsPrivate: Boolean(updated.apple_email_is_private),
        appleFullName: updated.apple_full_name ?? null,
        googleSub: updated.google_sub ?? null,
        googleEmail: updated.google_email ?? null,
        googleEmailVerified: Boolean(updated.google_email_verified),
        googleFullName: updated.google_full_name ?? null,
        status: updated.status,
        tokenVersion: updated.token_version ?? 0,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        lastLoginAt: updated.last_login_at,
        avatarHeadshotUrl: updated.avatar_headshot_url,
        avatarCachedAt: updated.avatar_cached_at,
      };
    }

    const generatedRobloxUserId = `apple:${input.appleSub}`;
    const generatedUsername =
      input.email?.split('@')[0]?.slice(0, 50) ||
      `apple_user_${input.appleSub.slice(0, 12)}`;
    const displayName = input.fullName || input.email || generatedUsername;

    const { data, error } = await supabase
      .from('app_users')
      .insert({
        roblox_user_id: generatedRobloxUserId,
        roblox_username: generatedUsername,
        roblox_display_name: displayName,
        roblox_profile_url: null,
        auth_provider: 'APPLE',
        apple_sub: input.appleSub,
        apple_email: input.email ?? null,
        apple_email_is_private: Boolean(input.isPrivateEmail),
        apple_full_name: input.fullName ?? null,
        updated_at: nowIso,
        last_login_at: nowIso,
      })
      .select()
      .single();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to insert Apple user: ${error.message}`);
    }

    return {
      id: data.id,
      robloxUserId: data.roblox_user_id,
      robloxUsername: data.roblox_username,
      robloxDisplayName: data.roblox_display_name,
      robloxProfileUrl: data.roblox_profile_url,
      authProvider: data.auth_provider ?? 'APPLE',
      appleSub: data.apple_sub ?? null,
      appleEmail: data.apple_email ?? null,
      appleEmailIsPrivate: Boolean(data.apple_email_is_private),
      appleFullName: data.apple_full_name ?? null,
      googleSub: data.google_sub ?? null,
      googleEmail: data.google_email ?? null,
      googleEmailVerified: Boolean(data.google_email_verified),
      googleFullName: data.google_full_name ?? null,
      status: data.status,
      tokenVersion: data.token_version ?? 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastLoginAt: data.last_login_at,
      avatarHeadshotUrl: data.avatar_headshot_url,
      avatarCachedAt: data.avatar_cached_at,
    };
  }

  async upsertGoogleUser(input: UpsertGoogleUserInput): Promise<AppUser> {
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from('app_users')
      .select()
      .eq('google_sub', input.googleSub)
      .maybeSingle();

    if (existingError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to load Google user: ${existingError.message}`);
    }

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        auth_provider: 'GOOGLE',
        updated_at: nowIso,
        last_login_at: nowIso,
      };
      if (input.email) {
        updatePayload.google_email = input.email;
      }
      if (typeof input.emailVerified === 'boolean') {
        updatePayload.google_email_verified = input.emailVerified;
      }
      if (input.fullName) {
        updatePayload.google_full_name = input.fullName;
      }

      const { data: updated, error: updateError } = await supabase
        .from('app_users')
        .update(updatePayload)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to update Google user: ${updateError.message}`);
      }

      return {
        id: updated.id,
        robloxUserId: updated.roblox_user_id,
        robloxUsername: updated.roblox_username,
        robloxDisplayName: updated.roblox_display_name,
        robloxProfileUrl: updated.roblox_profile_url,
        authProvider: updated.auth_provider ?? 'GOOGLE',
        appleSub: updated.apple_sub ?? null,
        appleEmail: updated.apple_email ?? null,
        appleEmailIsPrivate: Boolean(updated.apple_email_is_private),
        appleFullName: updated.apple_full_name ?? null,
        googleSub: updated.google_sub ?? null,
        googleEmail: updated.google_email ?? null,
        googleEmailVerified: Boolean(updated.google_email_verified),
        googleFullName: updated.google_full_name ?? null,
        status: updated.status,
        tokenVersion: updated.token_version ?? 0,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        lastLoginAt: updated.last_login_at,
        avatarHeadshotUrl: updated.avatar_headshot_url,
        avatarCachedAt: updated.avatar_cached_at,
      };
    }

    const generatedRobloxUserId = `google:${input.googleSub}`;
    const generatedUsername =
      input.email?.split('@')[0]?.slice(0, 50) ||
      `google_user_${input.googleSub.slice(0, 12)}`;
    const displayName = input.fullName || input.email || generatedUsername;

    const { data, error } = await supabase
      .from('app_users')
      .insert({
        roblox_user_id: generatedRobloxUserId,
        roblox_username: generatedUsername,
        roblox_display_name: displayName,
        roblox_profile_url: null,
        auth_provider: 'GOOGLE',
        google_sub: input.googleSub,
        google_email: input.email ?? null,
        google_email_verified: Boolean(input.emailVerified),
        google_full_name: input.fullName ?? null,
        updated_at: nowIso,
        last_login_at: nowIso,
      })
      .select()
      .single();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to insert Google user: ${error.message}`);
    }

    return {
      id: data.id,
      robloxUserId: data.roblox_user_id,
      robloxUsername: data.roblox_username,
      robloxDisplayName: data.roblox_display_name,
      robloxProfileUrl: data.roblox_profile_url,
      authProvider: data.auth_provider ?? 'GOOGLE',
      appleSub: data.apple_sub ?? null,
      appleEmail: data.apple_email ?? null,
      appleEmailIsPrivate: Boolean(data.apple_email_is_private),
      appleFullName: data.apple_full_name ?? null,
      googleSub: data.google_sub ?? null,
      googleEmail: data.google_email ?? null,
      googleEmailVerified: Boolean(data.google_email_verified),
      googleFullName: data.google_full_name ?? null,
      status: data.status,
      tokenVersion: data.token_version ?? 0,
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
    const isCacheFresh = cachedAt && (now.getTime() - cachedAt.getTime() < AVATAR_CACHE_TTL_MS);

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
