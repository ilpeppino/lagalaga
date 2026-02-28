import Fastify from 'fastify';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCompleteGoogleOAuth = jest.fn<any>();

jest.unstable_mockModule('../../services/robloxOAuth.js', () => ({
  RobloxOAuthService: class {
    generateAuthorizationUrl = jest.fn();
    exchangeCode = jest.fn();
    getUserInfo = jest.fn();
  },
}));

jest.unstable_mockModule('../../services/roblox-connection.service.js', () => ({
  RobloxConnectionService: class {
    saveConnection = jest.fn();
  },
}));

jest.unstable_mockModule('../../services/googleOAuth.js', () => ({
  GoogleOAuthService: class {
    generateAuthorizationUrl = jest.fn();
    exchangeCode = jest.fn();
    validateIdToken = jest.fn();
  },
}));

jest.unstable_mockModule('../../services/google-auth.service.js', () => ({
  GoogleAuthService: class {
    resolveUserForGoogleLogin = jest.fn();
  },
}));

jest.unstable_mockModule('../../services/tokenService.js', () => ({
  TokenService: class {
    generateTokens = jest.fn();
  },
}));

jest.unstable_mockModule('../../services/google-oauth-completion.service.js', () => ({
  completeGoogleOAuth: mockCompleteGoogleOAuth,
}));

const { robloxConnectRoutes } = await import('../../routes/roblox-connect.routes.js');
const { errorHandlerPlugin } = await import('../../plugins/errorHandler.js');
const { rateLimitPlugin } = await import('../../plugins/rate-limit.js');

function buildConfig() {
  return {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3001/api/auth/google/callback',
    GOOGLE_ISSUER: 'https://accounts.google.com',
    GOOGLE_JWKS_URI: '',
  };
}

describe('google callback shared completion usage', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCompleteGoogleOAuth.mockResolvedValue({
      accessToken: 'shared-access-token',
      refreshToken: 'shared-refresh-token',
      redirectUri: 'lagalaga://auth/google',
      user: {
        id: 'user-1',
        robloxUserId: null,
        robloxUsername: null,
        robloxDisplayName: null,
      },
    });

    app = Fastify({ logger: false });
    (app as any).config = buildConfig();
    await app.register(rateLimitPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(robloxConnectRoutes, { prefix: '/api/auth' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/auth/google/callback calls completeGoogleOAuth', async () => {
    const response = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state: 'oauth-state' });

    expect(response.status).toBe(200);
    expect(mockCompleteGoogleOAuth).toHaveBeenCalledWith(
      { code: 'oauth-code', state: 'oauth-state' },
      expect.objectContaining({
        jwtSecret: 'test-jwt-secret',
      })
    );
  });

  it('GET /api/auth/google/callback does not call completeGoogleOAuth', async () => {
    const response = await request(app.server)
      .get('/api/auth/google/callback')
      .query({ code: 'oauth-code', state: 'oauth-state' });

    expect(response.status).toBe(400);
    expect(mockCompleteGoogleOAuth).not.toHaveBeenCalled();
  });
});
