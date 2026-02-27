import { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxOAuthService } from '../services/robloxOAuth.js';
import { RobloxConnectionService } from '../services/roblox-connection.service.js';
import { GoogleOAuthService } from '../services/googleOAuth.js';
import { GoogleAuthService } from '../services/google-auth.service.js';
import { TokenService } from '../services/tokenService.js';
import { PlatformIdentityService } from '../services/platform-identity.service.js';
import {
  generateSignedOAuthState,
  generateCodeChallenge,
  verifySignedOAuthState,
} from '../utils/crypto.js';
import { AppError, AuthError, ErrorCodes } from '../utils/errors.js';
import { metrics } from '../plugins/metrics.js';

interface OAuthStateEntry {
  codeVerifier: string;
  userId: string;
  expiresAt: number;
}

const oauthStateStore = new Map<string, OAuthStateEntry>();

interface GoogleOAuthStateEntry {
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  expiresAt: number;
}

const googleOauthStateStore = new Map<string, GoogleOAuthStateEntry>();
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DEEP_LINK_REDIRECT_URI = 'lagalaga://auth';

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

function cleanupGoogleStateStore(nowMs: number = Date.now()): void {
  for (const [state, entry] of googleOauthStateStore.entries()) {
    if (entry.expiresAt <= nowMs) {
      googleOauthStateStore.delete(state);
    }
  }
}

function consumeGoogleStateEntry(state: string): GoogleOAuthStateEntry | null {
  cleanupGoogleStateStore();
  const entry = googleOauthStateStore.get(state);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    googleOauthStateStore.delete(state);
    return null;
  }
  googleOauthStateStore.delete(state);
  return entry;
}

function getValidStateEntry(state: string, userId: string): OAuthStateEntry | null {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  if (entry.userId !== userId) return null;
  if (entry.expiresAt <= Date.now()) {
    oauthStateStore.delete(state);
    return null;
  }
  return entry;
}

function consumeValidStateEntry(state: string, userId: string): OAuthStateEntry | null {
  const entry = getValidStateEntry(state, userId);
  if (!entry) return null;
  oauthStateStore.delete(state);
  return entry;
}

export async function robloxConnectRoutes(fastify: FastifyInstance) {
  const robloxOAuth = new RobloxOAuthService(fastify);
  const connectionService = new RobloxConnectionService(fastify);
  const googleOAuth = new GoogleOAuthService(fastify);
  const googleAuthService = new GoogleAuthService(fastify);
  const tokenService = new TokenService(fastify);
  const platformIdentityService = new PlatformIdentityService();

  fastify.get('/roblox/start', {
    preHandler: authenticate,
  }, async (request) => {
    const state = generateSignedOAuthState(request.server.config.JWT_SECRET);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    oauthStateStore.set(state, {
      codeVerifier,
      userId: request.user.userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
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
    const state = generateSignedOAuthState(request.server.config.JWT_SECRET, GOOGLE_OAUTH_STATE_TTL_MS);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const nonce = generateNonce();
    const redirectUri = request.query?.redirectUri?.trim() || DEFAULT_DEEP_LINK_REDIRECT_URI;

    cleanupGoogleStateStore();
    googleOauthStateStore.set(state, {
      codeVerifier,
      nonce,
      redirectUri,
      expiresAt: Date.now() + GOOGLE_OAUTH_STATE_TTL_MS,
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

    if (!verifySignedOAuthState(state, request.server.config.JWT_SECRET)) {
      throw new AppError('ACCOUNT_LINK_INVALID_STATE', 'OAuth state is invalid or expired.', 401, {
        severity: 'warning',
      });
    }

    const entry = consumeValidStateEntry(state, request.user.userId);
    if (!entry) {
      throw new AppError('ACCOUNT_LINK_INVALID_STATE', 'OAuth state is invalid or expired.', 401, {
        severity: 'warning',
      });
    }

    const tokenResponse = await robloxOAuth.exchangeCode(code, entry.codeVerifier);
    const userInfo = await robloxOAuth.getUserInfo(tokenResponse.access_token);

    await platformIdentityService.linkPlatformToUser({
      userId: request.user.userId,
      platformId: 'roblox',
      platformUserId: userInfo.sub,
      platformUsername: userInfo.preferred_username || userInfo.name,
      platformDisplayName: userInfo.nickname || null,
      platformAvatarUrl: userInfo.picture || null,
      robloxProfileUrl: userInfo.profile || null,
    });

    await connectionService.saveConnection({
      userId: request.user.userId,
      userInfo,
      tokenResponse,
    });

    return {
      connected: true,
      robloxUserId: userInfo.sub,
      verifiedAt: new Date().toISOString(),
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
    const { code, state } = request.body;

    if (!verifySignedOAuthState(state, request.server.config.JWT_SECRET)) {
      metrics.incrementCounter('auth_google_callback_total', { status: 'invalid_state' });
      throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid or expired state parameter');
    }

    const entry = consumeGoogleStateEntry(state);
    if (!entry) {
      metrics.incrementCounter('auth_google_callback_total', { status: 'invalid_state' });
      throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid or expired state parameter');
    }

    fastify.log.info({ provider: 'google' }, 'Google OAuth callback processing started');

    try {
      const tokenResponse = await googleOAuth.exchangeCode(code, entry.codeVerifier);
      const claims = await googleOAuth.validateIdToken(tokenResponse.id_token, entry.nonce);
      const user = await googleAuthService.resolveUserForGoogleLogin(claims);

      if (user.status === 'PENDING_DELETION') {
        metrics.incrementCounter('auth_google_callback_total', { status: 'forbidden' });
        throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is pending deletion');
      }

      if (user.status === 'DELETED') {
        metrics.incrementCounter('auth_google_callback_total', { status: 'forbidden' });
        throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is unavailable');
      }

      const tokens = tokenService.generateTokens({
        userId: user.id,
        robloxUserId: user.robloxUserId,
        robloxUsername: user.robloxUsername,
        tokenVersion: user.tokenVersion,
      });

      metrics.incrementCounter('auth_google_callback_total', { status: 'success' });
      fastify.log.info(
        {
          provider: 'google',
          userId: user.id,
        },
        'Google OAuth callback succeeded'
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
      metrics.incrementCounter('auth_google_callback_total', { status: 'failure' });
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
}
