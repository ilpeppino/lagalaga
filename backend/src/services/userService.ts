import { AVATAR_CACHE_TTL_MS } from '../config/cache.js';
import { createUserRepository } from '../db/repository-factory.js';
import type { AppUser } from '../db/repositories/user.repository.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { RobloxThumbnailService } from './robloxThumbnail.js';

export type { AppUser };

export interface UpsertUserInput {
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName?: string;
  robloxProfileUrl?: string;
}

export interface CreateUserInput {
  robloxUserId?: string | null;
  robloxUsername?: string | null;
  robloxDisplayName?: string | null;
  robloxProfileUrl?: string | null;
}

interface SyncProviderIdentityInput {
  userId: string;
  provider: 'APPLE' | 'GOOGLE';
  sub: string;
  email?: string | null;
  fullName?: string | null;
  emailVerified?: boolean | null;
  isPrivateEmail?: boolean | null;
}

export class UserService {
  private thumbnailService: RobloxThumbnailService;

  constructor() {
    this.thumbnailService = new RobloxThumbnailService();
  }

  async upsertUser(input: UpsertUserInput): Promise<AppUser> {
    const now = new Date().toISOString();
    const { data, error } = await createUserRepository().upsert({
      robloxUserId: input.robloxUserId,
      robloxUsername: input.robloxUsername,
      robloxDisplayName: input.robloxDisplayName ?? null,
      robloxProfileUrl: input.robloxProfileUrl ?? null,
      lastLoginAt: now,
      updatedAt: now,
    });

    if (error || !data) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to upsert user: ${error?.message ?? 'unknown error'}`);
    }

    return data;
  }

  async createUser(input: CreateUserInput = {}): Promise<AppUser> {
    const now = new Date().toISOString();
    const { data, error } = await createUserRepository().insert({
      robloxUserId: input.robloxUserId ?? null,
      robloxUsername: input.robloxUsername ?? null,
      robloxDisplayName: input.robloxDisplayName ?? null,
      robloxProfileUrl: input.robloxProfileUrl ?? null,
      lastLoginAt: now,
      updatedAt: now,
    });

    if (error || !data) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to create user: ${error?.message ?? 'unknown error'}`);
    }

    return data;
  }

  async touchLastLogin(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await createUserRepository().updateById(userId, {
      lastLoginAt: now,
      updatedAt: now,
    });

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to update last login: ${error.message}`);
    }
  }

  async syncProviderIdentity(input: SyncProviderIdentityInput): Promise<void> {
    const { data: current, error: currentError } = await createUserRepository().findColumns(input.userId, [
      'id',
      'robloxUserId',
      'authProvider',
    ]);

    if (currentError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to load user before provider sync: ${currentError.message}`);
    }
    if (!current) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'User not found during provider sync');
    }

    const nextAuthProvider = current.robloxUserId
      ? (current.authProvider ?? 'ROBLOX')
      : input.provider;

    const updatePayload: Partial<AppUser> = {
      authProvider: nextAuthProvider,
      updatedAt: new Date().toISOString(),
    };

    if (input.provider === 'APPLE') {
      updatePayload.appleSub = input.sub;
      updatePayload.appleEmail = input.email ?? null;
      updatePayload.appleFullName = input.fullName ?? null;
      if (input.isPrivateEmail !== undefined) {
        updatePayload.appleEmailIsPrivate = input.isPrivateEmail;
      }
    } else {
      updatePayload.googleSub = input.sub;
      updatePayload.googleEmail = input.email ?? null;
      updatePayload.googleFullName = input.fullName ?? null;
      if (input.emailVerified !== undefined) {
        updatePayload.googleEmailVerified = input.emailVerified;
      }
    }

    const { error } = await createUserRepository().updateById(input.userId, updatePayload);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to sync provider identity fields: ${error.message}`);
    }
  }

  async getUserById(id: string): Promise<AppUser | null> {
    const { data, error } = await createUserRepository().findById(id);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get user: ${error.message}`);
    }

    return data;
  }

  /**
   * Get user's avatar headshot URL with caching
   * Fetches from cache if available and fresh (< 24 hours old)
   * Otherwise fetches from Roblox and updates cache
   * Falls back to cached value if Roblox fetch fails
   */
  async getAvatarHeadshotUrl(userId: string, robloxUserId: string): Promise<string | null> {
    const { data: userData } = await createUserRepository().findColumns(userId, [
      'avatarHeadshotUrl',
      'avatarCachedAt',
    ]);

    const cachedUrl = userData?.avatarHeadshotUrl ?? null;
    const cachedAt = userData?.avatarCachedAt ? new Date(String(userData.avatarCachedAt)) : null;

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
        await createUserRepository().updateById(userId, {
          avatarHeadshotUrl: freshUrl,
          avatarCachedAt: now.toISOString(),
        });

        return freshUrl;
      }

      // If Roblox returned null but we have a cached URL, keep using it
      return cachedUrl;
    } catch {
      // On error, fall back to cached URL if available
      // This ensures we don't lose the avatar on temporary API failures
      return cachedUrl;
    }
  }

  /**
   * Atomically increment token_version for a user, invalidating all existing tokens.
   * Returns the new version number.
   */
  async incrementTokenVersion(userId: string, currentVersion: number): Promise<number> {
    const { error } = await createUserRepository().incrementTokenVersion(userId);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to rotate token version: ${error.message}`);
    }

    return currentVersion + 1;
  }
}
