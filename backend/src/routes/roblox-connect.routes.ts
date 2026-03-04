import { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxOAuthService } from '../services/robloxOAuth.js';
import { RobloxConnectionService } from '../services/roblox-connection.service.js';
import { GoogleOAuthService } from '../services/googleOAuth.js';
import { GoogleAuthService } from '../services/google-auth.service.js';
import { AppleOAuthService } from '../services/appleOAuth.js';
import { AppleAuthService } from '../services/apple-auth.service.js';
import { TokenService } from '../services/tokenService.js';
import { PlatformIdentityService } from '../services/platform-identity.service.js';
import { UserService } from '../services/userService.js';
import { completeGoogleOAuth } from '../services/google-oauth-completion.service.js';
import {
  generateSignedOAuthState,
  generateCodeChallenge,
  decodeSignedOAuthState,
} from '../utils/crypto.js';
import { AppError, AuthError, ErrorCodes } from '../utils/errors.js';
import { metrics } from '../plugins/metrics.js';

const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DEEP_LINK_REDIRECT_URI = 'lagalaga://auth/google';

function generateCodeVerifier(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const random = randomBytes(64);

  for (let i = 0; i < random.length; i += 1) {
    result += alphabet[random[i] % alphabet.length];
  }

  return result;
}

function generateNonce(): string {
  return randomBytes(32).toString('base64url');
}

function buildGoogleAuthRedirectUrl(
  redirectUri: string | undefined,
  params: Record<string, string>
): string {
  const baseUri = redirectUri?.trim() || DEFAULT_DEEP_LINK_REDIRECT_URI;

  const appendParams = (url: URL) => {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  };

  try {
    const url = new URL(baseUri);
    appendParams(url);
    return url.toString();
  } catch {
    const fallback = new URL(DEFAULT_DEEP_LINK_REDIRECT_URI);
    appendParams(fallback);
    return fallback.toString();
  }
}

export async function robloxConnectRoutes(fastify: FastifyInstance) {
  const robloxOAuth = new RobloxOAuthService(fastify);
  const connectionService = new RobloxConnectionService(fastify);
  const googleOAuth = new GoogleOAuthService(fastify);
  const googleAuthService = new GoogleAuthService(fastify);
  const appleOAuth = new AppleOAuthService(fastify);
  const appleAuthService = new AppleAuthService(fastify);
  const tokenService = new TokenService(fastify);
  const platformIdentityService = new PlatformIdentityService();
  const userService = new UserService();

  fastify.get('/roblox/start', {
    preHandler: authenticate,
  }, async (request) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateSignedOAuthState(request.server.config.JWT_SECRET, 10 * 60 * 1000, {
      codeVerifier,
      userId: request.user.userId,
    });

    const authorizationUrl = robloxOAuth.generateAuthorizationUrl(state, codeChallenge);

    return {
      authorizationUrl,
      state,
    };
  });

  fastify.get<{
    Querystring: { redirectUri?: string };
  }>('/google/start', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    schema: {
      querystring: {
        type: 'object',
        properties: {
          redirectUri: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const nonce = generateNonce();
    const redirectUri = request.query?.redirectUri?.trim() || DEFAULT_DEEP_LINK_REDIRECT_URI;
    const state = generateSignedOAuthState(request.server.config.JWT_SECRET, GOOGLE_OAUTH_STATE_TTL_MS, {
      codeVerifier,
      nonce,
      redirectUri,
    });

    const url = await googleOAuth.generateAuthorizationUrl({
      state,
      codeChallenge,
      nonce,
    });

    metrics.incrementCounter('auth_google_start_total', { status: 'success' });
    fastify.log.info(
      {
        provider: 'google',
        hasRedirectUri: Boolean(request.query?.redirectUri),
      },
      'Google OAuth start URL generated'
    );

    return { url };
  });

  const handleCallback = async (request: any) => {
    const code = request.body?.code ?? request.query?.code;
    const state = request.body?.state ?? request.query?.state;

    if (!code || !state) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Missing code or state');
    }

    const stateData = decodeSignedOAuthState<{ codeVerifier: string; userId: string }>(
      state,
      request.server.config.JWT_SECRET
    );
    if (!stateData || stateData.userId !== request.user.userId) {
      throw new AppError('ACCOUNT_LINK_INVALID_STATE', 'OAuth state is invalid or expired.', 401, {
        severity: 'warning',
      });
    }

    const tokenResponse = await robloxOAuth.exchangeCode(code, stateData.codeVerifier);
    const userInfo = await robloxOAuth.getUserInfo(tokenResponse.access_token);
    let effectiveUserId = request.user.userId;
    let mergedFromUserId: string | null = null;

    try {
      await platformIdentityService.linkPlatformToUser({
        userId: request.user.userId,
        platformId: 'roblox',
        platformUserId: userInfo.sub,
        platformUsername: userInfo.preferred_username || userInfo.name,
        platformDisplayName: userInfo.nickname || null,
        platformAvatarUrl: userInfo.picture || null,
        robloxProfileUrl: userInfo.profile || null,
      });
    } catch (error) {
      const appError = error as AppError | undefined;
      if (appError?.code !== 'CONFLICT_ACCOUNT_PROVIDER') {
        throw error;
      }

      const mergeAttempt = await platformIdentityService.mergeProviderShadowUserIntoRobloxUser({
        sourceUserId: request.user.userId,
        robloxPlatformUserId: userInfo.sub,
      });

      if (!mergeAttempt.merged || !mergeAttempt.mergedUserId) {
        request.log.warn({
          sourceUserId: request.user.userId,
          robloxUserId: userInfo.sub,
          reasonCode: mergeAttempt.reasonCode,
        }, 'Safe merge attempt was not applied after Roblox conflict');
        throw error;
      }

      effectiveUserId = mergeAttempt.mergedUserId;
      mergedFromUserId = request.user.userId;
      request.log.info({
        sourceUserId: mergedFromUserId,
        targetUserId: effectiveUserId,
        robloxUserId: userInfo.sub,
      }, 'Merged provider shadow account into existing Roblox account');
    }

    await connectionService.saveConnection({
      userId: effectiveUserId,
      userInfo,
      tokenResponse,
    });

    const effectiveUser = await userService.getUserById(effectiveUserId);
    if (!effectiveUser) {
      throw new AppError('AUTH_USER_NOT_FOUND', 'User account not found after Roblox link.', 500);
    }
    const generated = tokenService.generateTokens({
      userId: effectiveUser.id,
      robloxUserId: effectiveUser.robloxUserId,
      robloxUsername: effectiveUser.robloxUsername,
      tokenVersion: effectiveUser.tokenVersion,
    });
    const sessionTokens = {
      accessToken: generated.accessToken,
      refreshToken: generated.refreshToken,
    };

    return {
      connected: true,
      robloxUserId: userInfo.sub,
      verifiedAt: new Date().toISOString(),
      mergedFromUserId,
      mergedToUserId: effectiveUserId !== request.user.userId ? effectiveUserId : null,
      accessToken: sessionTokens.accessToken,
      refreshToken: sessionTokens.refreshToken,
    };
  };

  fastify.post<{
    Body: { code: string; state: string };
  }>('/roblox/callback', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['code', 'state'],
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
        },
      },
    },
  }, async (request) => handleCallback(request));

  fastify.get<{
    Querystring: { code: string; state: string };
  }>('/roblox/callback', {
    preHandler: authenticate,
    schema: {
      querystring: {
        type: 'object',
        required: ['code', 'state'],
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
        },
      },
    },
  }, async (request) => handleCallback(request));

  fastify.post<{
    Body: { code: string; state: string };
  }>('/google/callback', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['code', 'state'],
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    try {
      const result = await completeGoogleOAuth(
        {
          code: request.body.code,
          state: request.body.state,
        },
        {
          jwtSecret: request.server.config.JWT_SECRET,
          googleOAuth,
          googleAuthService,
          tokenService,
          consumeStateEntry: (s: string) => {
          const decoded = decodeSignedOAuthState<{ codeVerifier: string; nonce: string; redirectUri: string }>(
            s,
            request.server.config.JWT_SECRET
          );
          if (!decoded) return null;
          return { codeVerifier: decoded.codeVerifier, nonce: decoded.nonce, redirectUri: decoded.redirectUri, expiresAt: decoded.exp };
        },
        }
      );

      metrics.incrementCounter('auth_google_callback_total', { status: 'success' });
      fastify.log.info(
        {
          provider: 'google',
          userId: result.user.id,
        },
        'Google OAuth callback succeeded'
      );

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: {
          id: result.user.id,
          robloxUserId: result.user.robloxUserId,
          robloxUsername: result.user.robloxUsername,
          robloxDisplayName: result.user.robloxDisplayName,
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        if (error.code === ErrorCodes.AUTH_INVALID_STATE) {
          metrics.incrementCounter('auth_google_callback_total', { status: 'invalid_state' });
        } else if (error.code === ErrorCodes.AUTH_FORBIDDEN) {
          metrics.incrementCounter('auth_google_callback_total', { status: 'forbidden' });
        } else {
          metrics.incrementCounter('auth_google_callback_total', { status: 'failure' });
        }
      } else {
        metrics.incrementCounter('auth_google_callback_total', { status: 'failure' });
      }

      fastify.log.error(
        {
          provider: 'google',
          error: error instanceof Error ? error.message : String(error),
        },
        'Google OAuth callback failed'
      );
      throw error;
    }
  });

  fastify.get<{
    Querystring: { code?: string; state?: string };
  }>('/google/callback', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    schema: {
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const code = request.query?.code?.trim();
    const state = request.query?.state?.trim();

    if (!code || !state) {
      metrics.incrementCounter('auth_google_callback_total', { status: 'failure' });
      return reply
        .code(400)
        .type('text/plain; charset=utf-8')
        .send('Sign-in failed, return to app and try again.');
    }

    const stateEntry = decodeSignedOAuthState<{ codeVerifier: string; nonce: string; redirectUri: string }>(
      state,
      request.server.config.JWT_SECRET
    );
    if (!stateEntry) {
      metrics.incrementCounter('auth_google_callback_total', { status: 'invalid_state' });
      return reply
        .code(400)
        .type('text/plain; charset=utf-8')
        .send('Sign-in failed, return to app and try again.');
    }

    const redirectUrl = buildGoogleAuthRedirectUrl(stateEntry.redirectUri, {
      code,
      state,
    });

    metrics.incrementCounter('auth_google_callback_total', { status: 'success' });
    return reply.code(302).redirect(redirectUrl);
  });

  fastify.post<{
    Body: {
      identityToken: string;
      nonce?: string;
      email?: string;
      givenName?: string;
      familyName?: string;
      isPrivateEmail?: boolean;
    };
  }>('/apple/callback', {
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
          nonce: { type: 'string' },
          email: { type: 'string' },
          givenName: { type: 'string' },
          familyName: { type: 'string' },
          isPrivateEmail: { type: 'boolean' },
        },
      },
    },
  }, async (request) => {
    try {
      let currentUserId: string | null = null;
      const authorization = request.headers.authorization;
      if (authorization?.startsWith('Bearer ')) {
        const bearer = authorization.slice('Bearer '.length).trim();
        if (bearer) {
          try {
            const payload = tokenService.verifyAccessToken(bearer);
            const currentUser = await userService.getUserById(payload.userId);
            if (
              currentUser &&
              currentUser.status === 'ACTIVE' &&
              Number(currentUser.tokenVersion ?? 0) === Number(payload.tokenVersion ?? 0)
            ) {
              currentUserId = payload.userId;
            }
          } catch {
            currentUserId = null;
          }
        }
      }

      const claims = await appleOAuth.validateIdentityToken(
        request.body.identityToken,
        request.body.nonce
      );
      const user = await appleAuthService.resolveUserForAppleLogin({
        claims,
        currentUserId,
        profile: {
          email: request.body.email ?? null,
          givenName: request.body.givenName ?? null,
          familyName: request.body.familyName ?? null,
          isPrivateEmail: request.body.isPrivateEmail ?? null,
        },
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

      metrics.incrementCounter('auth_apple_callback_total', { status: 'success' });
      fastify.log.info(
        {
          provider: 'apple',
          userId: user.id,
        },
        'Apple OAuth callback succeeded'
      );

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          robloxUserId: user.robloxUserId,
          robloxUsername: user.robloxUsername,
          robloxDisplayName: user.robloxDisplayName,
        },
      };
    } catch (error) {
      if (error instanceof AppError || error instanceof AuthError) {
        if (error.code === ErrorCodes.AUTH_FORBIDDEN) {
          metrics.incrementCounter('auth_apple_callback_total', { status: 'forbidden' });
        } else {
          metrics.incrementCounter('auth_apple_callback_total', { status: 'failure' });
        }
      } else {
        metrics.incrementCounter('auth_apple_callback_total', { status: 'failure' });
      }

      fastify.log.error(
        {
          provider: 'apple',
          error: error instanceof Error ? error.message : String(error),
        },
        'Apple OAuth callback failed'
      );
      throw error;
    }
  });
}
