import { FastifyInstance } from 'fastify';
import { RobloxOAuthService } from '../services/robloxOAuth.js';
import { UserService } from '../services/userService.js';
import { TokenService } from '../services/tokenService.js';
import { generateState, isValidCodeVerifier } from '../utils/crypto.js';
import { AuthError, ErrorCodes } from '../utils/errors.js';
import { authenticate } from '../middleware/authenticate.js';

// Store states in memory (in production, use Redis)
const validStates = new Map<string, number>();

// Clean up expired states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, timestamp] of validStates.entries()) {
    if (now - timestamp > 10 * 60 * 1000) {
      validStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

export async function authRoutes(fastify: FastifyInstance) {
  const robloxOAuth = new RobloxOAuthService(fastify);
  const userService = new UserService();
  const tokenService = new TokenService(fastify);

  /**
   * POST /auth/roblox/start
   * Generate authorization URL with state
   */
  fastify.post<{
    Body: { codeChallenge: string };
  }>('/auth/roblox/start', {
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

    const state = generateState();
    validStates.set(state, Date.now());

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
  }>('/auth/roblox/callback', {
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
    if (!validStates.has(state)) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid or expired state parameter');
    }
    validStates.delete(state);

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

    // Generate our JWT tokens
    const tokens = tokenService.generateTokens({
      userId: user.id,
      robloxUserId: user.robloxUserId,
      robloxUsername: user.robloxUsername,
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
   * POST /auth/refresh
   * Refresh expired JWT
   */
  fastify.post<{
    Body: { refreshToken: string };
  }>('/auth/refresh', {
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

      // Generate new tokens
      const tokens = tokenService.generateTokens({
        userId: user.id,
        robloxUserId: user.robloxUserId,
        robloxUsername: user.robloxUsername,
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
  fastify.post('/auth/revoke', {
    preHandler: authenticate,
  }, async (_request, reply) => {
    // In production, add token to blacklist (Redis)
    // For now, just return success
    reply.status(204).send();
  });

  /**
   * GET /auth/me
   * Get current user info
   */
  fastify.get('/auth/me', {
    preHandler: authenticate,
  }, async (request) => {
    const user = await userService.getUserById(request.user.userId);
    if (!user) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'User not found');
    }

    return {
      user: {
        id: user.id,
        robloxUserId: user.robloxUserId,
        robloxUsername: user.robloxUsername,
        robloxDisplayName: user.robloxDisplayName,
        robloxProfileUrl: user.robloxProfileUrl,
      },
    };
  });
}
