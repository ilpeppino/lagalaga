import { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxOAuthService } from '../services/robloxOAuth.js';
import { RobloxConnectionService } from '../services/roblox-connection.service.js';
import {
  generateSignedOAuthState,
  generateCodeChallenge,
  verifySignedOAuthState,
} from '../utils/crypto.js';
import { AuthError, ErrorCodes } from '../utils/errors.js';

interface OAuthStateEntry {
  codeVerifier: string;
  userId: string;
  expiresAt: number;
}

const oauthStateStore = new Map<string, OAuthStateEntry>();

function generateCodeVerifier(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const random = randomBytes(64);

  for (let i = 0; i < random.length; i += 1) {
    result += alphabet[random[i] % alphabet.length];
  }

  return result;
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

export async function robloxConnectRoutes(fastify: FastifyInstance) {
  const robloxOAuth = new RobloxOAuthService(fastify);
  const connectionService = new RobloxConnectionService(fastify);

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

  const handleCallback = async (request: any) => {
    const code = request.body?.code ?? request.query?.code;
    const state = request.body?.state ?? request.query?.state;

    if (!code || !state) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Missing code or state');
    }

    if (!verifySignedOAuthState(state, request.server.config.JWT_SECRET)) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid or expired state parameter');
    }

    const entry = getValidStateEntry(state, request.user.userId);
    if (!entry) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid OAuth state for this user');
    }

    const tokenResponse = await robloxOAuth.exchangeCode(code, entry.codeVerifier);
    const userInfo = await robloxOAuth.getUserInfo(tokenResponse.access_token);

    await connectionService.saveConnection({
      userId: request.user.userId,
      userInfo,
      tokenResponse,
    });

    oauthStateStore.delete(state);

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
}
