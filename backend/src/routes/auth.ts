import { FastifyInstance } from 'fastify';
import { RobloxOAuthService } from '../services/robloxOAuth.js';
import { AppleAuthService } from '../services/apple-auth.service.js';
import { UserService } from '../services/userService.js';
import { RobloxConnectionService } from '../services/roblox-connection.service.js';
import { TokenService } from '../services/tokenService.js';
import { FriendshipService } from '../services/friendship.service.js';
import {
  generateSignedOAuthState,
  isValidCodeVerifier,
  verifySignedOAuthState,
} from '../utils/crypto.js';
import { AuthError, ErrorCodes } from '../utils/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { logAuthEvent } from '../lib/logger.js';

export async function authRoutes(fastify: FastifyInstance) {
  const robloxOAuth = new RobloxOAuthService(fastify);
  const appleAuth = new AppleAuthService();
  const robloxConnectionService = new RobloxConnectionService(fastify);
  const userService = new UserService();
  const tokenService = new TokenService(fastify);
  const friendshipService = new FriendshipService();

  /**
   * POST /auth/roblox/start
   * Generate authorization URL with state
   */
  fastify.post<{
    Body: { codeChallenge: string };
  }>('/roblox/start', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['codeChallenge'],
        properties: {
          codeChallenge: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { codeChallenge } = request.body;

    const state = generateSignedOAuthState(request.server.config.JWT_SECRET);

    const authorizationUrl = robloxOAuth.generateAuthorizationUrl(state, codeChallenge);

    return {
      authorizationUrl,
      state,
    };
  });

  /**
   * POST /auth/roblox/callback
   * Exchange authorization code for JWT
   */
  fastify.post<{
    Body: {
      code: string;
      state: string;
      codeVerifier: string;
    };
  }>('/roblox/callback', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['code', 'state', 'codeVerifier'],
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
          codeVerifier: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { code, state, codeVerifier } = request.body;

    // Validate state
    if (!verifySignedOAuthState(state, request.server.config.JWT_SECRET)) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid or expired state parameter');
    }

    // Validate code verifier
    if (!isValidCodeVerifier(codeVerifier)) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid code verifier format');
    }

    // Exchange code for tokens
    const tokenResponse = await robloxOAuth.exchangeCode(code, codeVerifier);

    // Get user info
    const userInfo = await robloxOAuth.getUserInfo(tokenResponse.access_token);

    // Upsert user in database
    const user = await userService.upsertUser({
      robloxUserId: userInfo.sub,
      robloxUsername: userInfo.preferred_username || userInfo.name,
      robloxDisplayName: userInfo.nickname,
      robloxProfileUrl: userInfo.profile,
    });

    // Best-effort Roblox connection persistence for Presence APIs.
    // Login should still succeed even if token persistence fails.
    try {
      await robloxConnectionService.saveConnection({
        userId: user.id,
        userInfo,
        tokenResponse,
      });
    } catch (connectionError) {
      fastify.log.warn(
        { error: connectionError instanceof Error ? connectionError.message : String(connectionError), userId: user.id },
        'Failed to persist Roblox OAuth connection during sign-in'
      );
    }

    // Fire-and-forget Roblox friends cache sync; login should not fail if this fails.
    void friendshipService.syncRobloxCacheBestEffort(user.id);

    if (user.status === 'PENDING_DELETION') {
      throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is pending deletion');
    }

    if (user.status === 'DELETED') {
      throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is unavailable');
    }

    // Generate our JWT tokens
    const tokens = tokenService.generateTokens({
      userId: user.id,
      robloxUserId: user.robloxUserId,
      robloxUsername: user.robloxUsername,
      tokenVersion: user.tokenVersion,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        robloxUserId: user.robloxUserId,
        robloxUsername: user.robloxUsername,
        robloxDisplayName: user.robloxDisplayName,
        robloxProfileUrl: user.robloxProfileUrl,
      },
    };
  });

  /**
   * POST /auth/apple
   * Verify Apple identity token and issue app JWTs.
   */
  fastify.post<{
    Body: {
      identityToken: string;
      authorizationCode?: string;
      email?: string | null;
      fullName?: {
        givenName?: string | null;
        middleName?: string | null;
        familyName?: string | null;
        nickname?: string | null;
      } | null;
    };
  }>('/apple', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['identityToken'],
        properties: {
          identityToken: { type: 'string' },
          authorizationCode: { type: 'string' },
          email: { type: 'string' },
          fullName: {
            type: 'object',
            properties: {
              givenName: { type: 'string' },
              middleName: { type: 'string' },
              familyName: { type: 'string' },
              nickname: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request) => {
    const { identityToken, authorizationCode, email: requestEmail, fullName } = request.body;
    const audiences = request.server.config.APPLE_AUDIENCE
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (audiences.length === 0) {
      fastify.log.error('APPLE_AUDIENCE is not configured');
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple sign-in is not configured');
    }

    try {
      const appleIdentity = await appleAuth.verifyIdentityToken(identityToken, audiences);
      const computedFullName = fullName
        ? [fullName.givenName, fullName.middleName, fullName.familyName].filter(Boolean).join(' ').trim() || null
        : null;

      const user = await userService.upsertAppleUser({
        appleSub: appleIdentity.sub,
        email: requestEmail || appleIdentity.email || null,
        fullName: computedFullName,
        isPrivateEmail:
          appleIdentity.is_private_email === true ||
          appleIdentity.is_private_email === 'true',
      });

      if (user.status === 'PENDING_DELETION') {
        throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is pending deletion');
      }
      if (user.status === 'DELETED') {
        throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is unavailable');
      }

      const tokens = tokenService.generateTokens({
        userId: user.id,
        robloxUserId: user.robloxUserId,
        robloxUsername: user.robloxUsername,
        tokenVersion: user.tokenVersion,
      });

      logAuthEvent('login', user.id, {
        provider: 'apple',
        hasAuthorizationCode: Boolean(authorizationCode),
        hasEmail: Boolean(requestEmail || appleIdentity.email),
        isPrivateEmail: Boolean(user.appleEmailIsPrivate),
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          robloxUserId: user.robloxUserId,
          robloxUsername: user.robloxUsername,
          robloxDisplayName: user.robloxDisplayName,
          robloxProfileUrl: user.robloxProfileUrl,
        },
      };
    } catch (error) {
      logAuthEvent('auth_failed', undefined, {
        provider: 'apple',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  /**
   * POST /auth/refresh
   * Refresh expired JWT
   */
  fastify.post<{
    Body: { refreshToken: string };
  }>('/refresh', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { refreshToken } = request.body;

    try {
      const payload = tokenService.verifyRefreshToken(refreshToken);

      // Get updated user info
      const user = await userService.getUserById(payload.userId);
      if (!user) {
        throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'User not found');
      }

      if (user.status !== 'ACTIVE') {
        throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is not active');
      }

      if (payload.tokenVersion !== user.tokenVersion) {
        throw new AuthError(ErrorCodes.AUTH_TOKEN_REVOKED, 'Refresh token has been revoked');
      }

      // Generate new tokens
      const tokens = tokenService.generateTokens({
        userId: user.id,
        robloxUserId: user.robloxUserId,
        robloxUsername: user.robloxUsername,
        tokenVersion: user.tokenVersion,
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      throw new AuthError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Invalid or expired refresh token');
    }
  });

  /**
   * POST /auth/revoke
   * Sign out (in production, blacklist token)
   */
  fastify.post('/revoke', {
    preHandler: authenticate,
  }, async (_request, reply) => {
    // In production, add token to blacklist (Redis)
    // For now, just return success
    reply.status(204).send();
  });

  /**
   * GET /auth/me
   * Get current user info with avatar
   */
  fastify.get('/me', {
    preHandler: authenticate,
  }, async (request) => {
    const user = await userService.getUserById(request.user.userId);
    if (!user) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'User not found');
    }

    // Fetch avatar only for Roblox-auth users (non-blocking on failure)
    let avatarHeadshotUrl: string | null = null;
    if (user.authProvider === 'ROBLOX') {
      try {
        avatarHeadshotUrl = await userService.getAvatarHeadshotUrl(
          user.id,
          user.robloxUserId
        );
      } catch (error) {
        // Log but don't fail the request if avatar fetch fails
        fastify.log.warn(`Failed to fetch avatar for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      id: user.id,
      robloxUserId: user.robloxUserId,
      robloxUsername: user.robloxUsername,
      robloxDisplayName: user.robloxDisplayName,
      avatarHeadshotUrl,
      robloxConnected: user.authProvider === 'ROBLOX',
      authProvider: user.authProvider,
      email: user.appleEmail,
    };
  });
}
