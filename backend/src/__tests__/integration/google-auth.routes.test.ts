import Fastify from 'fastify';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppError, AuthError } from '../../utils/errors.js';

const mockGoogleGenerateAuthorizationUrl = jest.fn<any>();
const mockGoogleExchangeCode = jest.fn<any>();
const mockGoogleValidateIdToken = jest.fn<any>();
const mockResolveUserForGoogleLogin = jest.fn<any>();
const mockGenerateTokens = jest.fn<any>();

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
    generateAuthorizationUrl = mockGoogleGenerateAuthorizationUrl;
    exchangeCode = mockGoogleExchangeCode;
    validateIdToken = mockGoogleValidateIdToken;
  },
}));

jest.unstable_mockModule('../../services/google-auth.service.js', () => ({
  GoogleAuthService: class {
    resolveUserForGoogleLogin = mockResolveUserForGoogleLogin;
  },
}));

jest.unstable_mockModule('../../services/tokenService.js', () => ({
  TokenService: class {
    generateTokens = mockGenerateTokens;
  },
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

function parseStateFromUrl(url: string): string {
  return new URL(url).searchParams.get('state') ?? '';
}

describe('google auth routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGoogleGenerateAuthorizationUrl.mockImplementation(async ({ state }: { state: string }) => {
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`;
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

  it('GET /api/auth/google/start returns Google authorization URL', async () => {
    const response = await request(app.server).get('/api/auth/google/start');

    expect(response.status).toBe(200);
    expect(response.body.url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('POST /api/auth/google/callback rejects invalid state', async () => {
    const response = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state: 'bad-state' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_003');
    expect(mockGoogleExchangeCode).not.toHaveBeenCalled();
  });

  it('POST /api/auth/google/callback handles token exchange failures', async () => {
    const start = await request(app.server).get('/api/auth/google/start');
    const state = parseStateFromUrl(start.body.url);

    mockGoogleExchangeCode.mockRejectedValue(
      new AuthError('AUTH_004', 'Google token exchange failed')
    );

    const response = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_004');
  });

  it('POST /api/auth/google/callback handles ID token validation failures', async () => {
    const start = await request(app.server).get('/api/auth/google/start');
    const state = parseStateFromUrl(start.body.url);

    mockGoogleExchangeCode.mockResolvedValue({ id_token: 'bad-token' });
    mockGoogleValidateIdToken.mockRejectedValue(
      new AuthError('AUTH_004', 'Google ID token validation failed')
    );

    const response = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_004');
  });

  it('POST /api/auth/google/callback logs in existing google-linked user', async () => {
    const start = await request(app.server).get('/api/auth/google/start');
    const state = parseStateFromUrl(start.body.url);

    mockGoogleExchangeCode.mockResolvedValue({ id_token: 'id-token' });
    mockGoogleValidateIdToken.mockResolvedValue({ sub: 'google-sub-1' });
    mockResolveUserForGoogleLogin.mockResolvedValue({
      id: 'user-existing',
      robloxUserId: null,
      robloxUsername: null,
      robloxDisplayName: null,
      status: 'ACTIVE',
      tokenVersion: 2,
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'access-token-existing',
      refreshToken: 'refresh-token-existing',
    });

    const response = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: 'access-token-existing',
      refreshToken: 'refresh-token-existing',
      user: {
        id: 'user-existing',
      },
    });
  });

  it('POST /api/auth/google/callback creates first-time google user session', async () => {
    const start = await request(app.server).get('/api/auth/google/start');
    const state = parseStateFromUrl(start.body.url);

    mockGoogleExchangeCode.mockResolvedValue({ id_token: 'id-token' });
    mockGoogleValidateIdToken.mockResolvedValue({ sub: 'google-sub-new' });
    mockResolveUserForGoogleLogin.mockResolvedValue({
      id: 'user-new',
      robloxUserId: null,
      robloxUsername: null,
      robloxDisplayName: null,
      status: 'ACTIVE',
      tokenVersion: 0,
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'access-token-new',
      refreshToken: 'refresh-token-new',
    });

    const response = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('access-token-new');
    expect(response.body.refreshToken).toBe('refresh-token-new');
    expect(mockResolveUserForGoogleLogin).toHaveBeenCalledTimes(1);
  });

  it('POST /api/auth/google/callback returns ACCOUNT_LINK_CONFLICT when provider link belongs to another user', async () => {
    const start = await request(app.server).get('/api/auth/google/start');
    const state = parseStateFromUrl(start.body.url);

    mockGoogleExchangeCode.mockResolvedValue({ id_token: 'id-token' });
    mockGoogleValidateIdToken.mockResolvedValue({ sub: 'google-sub-conflict' });
    mockResolveUserForGoogleLogin.mockRejectedValue(
      new AppError('ACCOUNT_LINK_CONFLICT', 'Google account already linked', 409, {
        metadata: { platformId: 'google', action: 'use_original_login' },
      })
    );

    const response = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ACCOUNT_LINK_CONFLICT');
  });

  it('GET /api/auth/google/callback redirects to deep link on success', async () => {
    const start = await request(app.server)
      .get('/api/auth/google/start')
      .query({ redirectUri: 'lagalaga://auth/google' });
    const state = parseStateFromUrl(start.body.url);

    const response = await request(app.server)
      .get('/api/auth/google/callback')
      .query({ code: 'oauth-code', state });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBeDefined();
    const redirectUrl = new URL(response.headers.location as string);
    expect(`${redirectUrl.protocol}//${redirectUrl.host}${redirectUrl.pathname}`).toBe('lagalaga://auth/google');
    expect(redirectUrl.searchParams.get('code')).toBe('oauth-code');
    expect(redirectUrl.searchParams.get('state')).toBe(state);
    expect(mockGoogleExchangeCode).not.toHaveBeenCalled();
  });

  it('GET /api/auth/google/callback preserves state for POST completion', async () => {
    const start = await request(app.server)
      .get('/api/auth/google/start')
      .query({ redirectUri: 'lagalaga://auth/google' });
    const state = parseStateFromUrl(start.body.url);

    const getResponse = await request(app.server)
      .get('/api/auth/google/callback')
      .query({ code: 'oauth-code', state });

    expect(getResponse.status).toBe(302);

    mockGoogleExchangeCode.mockResolvedValue({ id_token: 'id-token' });
    mockGoogleValidateIdToken.mockResolvedValue({ sub: 'google-sub-1' });
    mockResolveUserForGoogleLogin.mockResolvedValue({
      id: 'user-existing',
      robloxUserId: null,
      robloxUsername: null,
      robloxDisplayName: null,
      status: 'ACTIVE',
      tokenVersion: 2,
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'access-token-existing',
      refreshToken: 'refresh-token-existing',
    });

    const postResponse = await request(app.server)
      .post('/api/auth/google/callback')
      .send({ code: 'oauth-code', state });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.accessToken).toBe('access-token-existing');
  });

  it('GET /api/auth/google/callback returns 400 when code/state are missing', async () => {
    const response = await request(app.server).get('/api/auth/google/callback');

    expect(response.status).toBe(400);
    expect(response.text).toContain('Sign-in failed');
  });
});
