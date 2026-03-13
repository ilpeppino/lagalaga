import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleIdTokenClaims } from './googleOAuth.js';
import { UserService, type AppUser } from './userService.js';
import { PlatformIdentityService } from './platform-identity.service.js';
import { createHash } from 'node:crypto';

interface GoogleAuthDeps {
  supabase?: SupabaseClient;
}

export class GoogleAuthService {
  private readonly fastify: FastifyInstance;
  private readonly userService: UserService;
  private readonly platformIdentityService: PlatformIdentityService;

  constructor(fastify: FastifyInstance, deps: GoogleAuthDeps = {}) {
    this.fastify = fastify;
    this.userService = new UserService();
    this.platformIdentityService = new PlatformIdentityService({ supabase: deps.supabase });
  }

  async resolveUserForGoogleLogin(claims: GoogleIdTokenClaims): Promise<AppUser> {
    let userId = await this.platformIdentityService.findUserIdByPlatform('google', claims.sub);
    const googleSubHash = createHash('sha256').update(claims.sub).digest('hex').slice(0, 16);
    const wasExistingLinkedUser = Boolean(userId);

    if (!userId) {
      const created = await this.userService.createUser({
        robloxUserId: null,
        robloxUsername: null,
        robloxDisplayName: null,
        robloxProfileUrl: null,
      });
      userId = created.id;
    }

    await this.platformIdentityService.linkPlatformToUser({
      userId,
      platformId: 'google',
      platformUserId: claims.sub,
      platformUsername: claims.email ?? null,
      platformDisplayName: claims.name ?? null,
      platformAvatarUrl: claims.picture ?? null,
      metadata: {
        email: claims.email ?? null,
        email_verified: claims.email_verified ?? false,
        name: claims.name ?? null,
        picture: claims.picture ?? null,
      },
    });

    await this.userService.syncProviderIdentity({
      userId,
      provider: 'GOOGLE',
      sub: claims.sub,
      email: claims.email ?? null,
      fullName: claims.name ?? null,
      emailVerified: claims.email_verified ?? false,
    });

    await this.userService.touchLastLogin(userId);

    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new Error('User not found after Google login resolution');
    }

    if (wasExistingLinkedUser) {
      this.fastify.log.info(
        {
          event: 'auth_google_existing_user_resolved',
          provider: 'google',
          userId,
          googleSubHash,
        },
        'Resolved existing user by Google platform identity'
      );
    }

    return user;
  }
}
