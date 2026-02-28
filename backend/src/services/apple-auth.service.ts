import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppleIdTokenClaims } from './appleOAuth.js';
import { UserService, type AppUser } from './userService.js';
import { PlatformIdentityService } from './platform-identity.service.js';
import { AppError } from '../utils/errors.js';

interface AppleAuthDeps {
  supabase?: SupabaseClient;
}

interface ResolveAppleLoginInput {
  claims: AppleIdTokenClaims;
  currentUserId?: string | null;
  profile?: {
    email?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    isPrivateEmail?: boolean | null;
  };
}

function toBoolean(value: boolean | 'true' | 'false' | undefined): boolean | null {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export class AppleAuthService {
  private readonly userService: UserService;
  private readonly platformIdentityService: PlatformIdentityService;

  constructor(_fastify: FastifyInstance, deps: AppleAuthDeps = {}) {
    this.userService = new UserService();
    this.platformIdentityService = new PlatformIdentityService({ supabase: deps.supabase });
  }

  async resolveUserForAppleLogin(input: ResolveAppleLoginInput): Promise<AppUser> {
    const existingAppleUserId = await this.platformIdentityService.findUserIdByPlatform('apple', input.claims.sub);
    const currentUserId = input.currentUserId ?? null;
    let userId = existingAppleUserId;

    if (existingAppleUserId && currentUserId && existingAppleUserId !== currentUserId) {
      throw new AppError(
        'CONFLICT_ACCOUNT_PROVIDER',
        'This Apple account is already linked to another LagaLaga account.',
        409,
        {
          severity: 'warning',
          metadata: {
            provider: 'apple',
            action: 'use_original_login',
          },
        }
      );
    }

    if (!userId && currentUserId) {
      userId = currentUserId;
    }

    if (!userId) {
      const created = await this.userService.createUser({
        robloxUserId: null,
        robloxUsername: null,
        robloxDisplayName: null,
        robloxProfileUrl: null,
      });
      userId = created.id;
    }

    const fullName = [input.profile?.givenName, input.profile?.familyName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
      .trim() || null;

    await this.platformIdentityService.linkPlatformToUser({
      userId,
      platformId: 'apple',
      platformUserId: input.claims.sub,
      platformUsername: input.profile?.email ?? input.claims.email ?? null,
      platformDisplayName: fullName,
      metadata: {
        email: input.profile?.email ?? input.claims.email ?? null,
        email_verified: toBoolean(input.claims.email_verified),
        is_private_email: input.profile?.isPrivateEmail ?? toBoolean(input.claims.is_private_email),
        given_name: input.profile?.givenName ?? null,
        family_name: input.profile?.familyName ?? null,
        full_name: fullName,
      },
    });

    await this.userService.touchLastLogin(userId);

    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new Error('User not found after Apple login resolution');
    }
    return user;
  }
}
