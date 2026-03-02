import Fastify from 'fastify';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppError } from '../../utils/errors.js';

const mockRobloxGenerateAuthorizationUrl = jest.fn<any>();
const mockRobloxExchangeCode = jest.fn<any>();
const mockRobloxGetUserInfo = jest.fn<any>();
const mockSaveConnection = jest.fn<any>();
const mockLinkPlatformToUser = jest.fn<any>();
const mockMergeProviderShadowUserIntoRobloxUser = jest.fn<any>();
const mockGenerateSignedOAuthState = jest.fn<any>();
const mockVerifySignedOAuthState = jest.fn<any>();
const mockGenerateCodeChallenge = jest.fn<any>();
const mockGenerateTokens = jest.fn<any>();
const mockGetUserById = jest.fn<any>();

jest.unstable_mockModule('../../services/robloxOAuth.js', () => ({
  RobloxOAuthService: class {
    generateAuthorizationUrl = mockRobloxGenerateAuthorizationUrl;
    exchangeCode = mockRobloxExchangeCode;
    getUserInfo = mockRobloxGetUserInfo;
  },
}));

jest.unstable_mockModule('../../services/roblox-connection.service.js', () => ({
  RobloxConnectionService: class {
    saveConnection = mockSaveConnection;
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
    generateTokens = mockGenerateTokens;
  },
}));

jest.unstable_mockModule('../../services/platform-identity.service.js', () => ({
  PlatformIdentityService: class {
    linkPlatformToUser = mockLinkPlatformToUser;
    mergeProviderShadowUserIntoRobloxUser = mockMergeProviderShadowUserIntoRobloxUser;
  },
}));

jest.unstable_mockModule('../../services/userService.js', () => ({
  UserService: class {
    getUserById = mockGetUserById;
  },
}));

jest.unstable_mockModule('../../middleware/authenticate.js', () => ({
  authenticate: async (request: any) => {
    request.user = { userId: 'user-google-1', tokenVersion: 0, robloxUserId: null, robloxUsername: null };
  },
}));

jest.unstable_mockModule('../../utils/crypto.js', () => ({
  generateSignedOAuthState: mockGenerateSignedOAuthState,
  verifySignedOAuthState: mockVerifySignedOAuthState,
  generateCodeChallenge: mockGenerateCodeChallenge,
}));

const { robloxConnectRoutes } = await import('../../routes/roblox-connect.routes.js');
const { errorHandlerPlugin } = await import('../../plugins/errorHandler.js');
const { rateLimitPlugin } = await import('../../plugins/rate-limit.js');

describe('roblox connect routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGenerateSignedOAuthState.mockReturnValue('signed-state');
    mockGenerateCodeChallenge.mockReturnValue('challenge');
    mockVerifySignedOAuthState.mockReturnValue(true);
    mockRobloxGenerateAuthorizationUrl.mockReturnValue('https://roblox.example/auth');
    mockMergeProviderShadowUserIntoRobloxUser.mockResolvedValue({
      merged: false,
      mergedUserId: null,
      reasonCode: 'NOT_ATTEMPTED',
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'access-after-merge',
      refreshToken: 'refresh-after-merge',
    });
    mockGetUserById.mockResolvedValue({
      id: 'user-google-1',
      robloxUserId: '777',
      robloxUsername: 'roblox-user',
      tokenVersion: 0,
      status: 'ACTIVE',
    });

    app = Fastify({ logger: false });
    (app as any).config = {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
    };
    await app.register(rateLimitPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(robloxConnectRoutes, { prefix: '/api/auth' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('links roblox successfully for authenticated user', async () => {
    mockRobloxExchangeCode.mockResolvedValue({ access_token: 'roblox-access-token' });
    mockRobloxGetUserInfo.mockResolvedValue({
      sub: '777',
      preferred_username: 'roblox-user',
      name: 'roblox-user',
      nickname: 'Roblox User',
      profile: 'https://www.roblox.com/users/777/profile',
      picture: null,
    });
    mockLinkPlatformToUser.mockResolvedValue(undefined);
    mockSaveConnection.mockResolvedValue(undefined);

    const start = await request(app.server)
      .get('/api/auth/roblox/start')
      .set('Authorization', 'Bearer fake-token');

    const response = await request(app.server)
      .post('/api/auth/roblox/callback')
      .set('Authorization', 'Bearer fake-token')
      .send({ code: 'oauth-code', state: start.body.state });

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.robloxUserId).toBe('777');
    expect(mockLinkPlatformToUser).toHaveBeenCalledTimes(1);
  });

  it('returns CONFLICT_ACCOUNT_PROVIDER when roblox identity belongs to another account', async () => {
    mockRobloxExchangeCode.mockResolvedValue({ access_token: 'roblox-access-token' });
    mockRobloxGetUserInfo.mockResolvedValue({
      sub: '777',
      preferred_username: 'roblox-user',
      name: 'roblox-user',
      nickname: 'Roblox User',
      profile: 'https://www.roblox.com/users/777/profile',
      picture: null,
    });
    mockLinkPlatformToUser.mockRejectedValue(
      new AppError('CONFLICT_ACCOUNT_PROVIDER', 'Roblox account already linked', 409, {
        metadata: { platformId: 'roblox', action: 'use_original_login' },
      })
    );

    const start = await request(app.server)
      .get('/api/auth/roblox/start')
      .set('Authorization', 'Bearer fake-token');

    const response = await request(app.server)
      .post('/api/auth/roblox/callback')
      .set('Authorization', 'Bearer fake-token')
      .send({ code: 'oauth-code', state: start.body.state });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT_ACCOUNT_PROVIDER');
  });

  it('returns ACCOUNT_LINK_INVALID_STATE for expired or invalid state', async () => {
    mockVerifySignedOAuthState.mockReturnValue(false);

    const response = await request(app.server)
      .post('/api/auth/roblox/callback')
      .set('Authorization', 'Bearer fake-token')
      .send({ code: 'oauth-code', state: 'invalid-state' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCOUNT_LINK_INVALID_STATE');
  });

  it('safely merges provider shadow account into existing roblox user and returns replacement tokens', async () => {
    mockRobloxExchangeCode.mockResolvedValue({ access_token: 'roblox-access-token' });
    mockRobloxGetUserInfo.mockResolvedValue({
      sub: '777',
      preferred_username: 'roblox-user',
      name: 'roblox-user',
      nickname: 'Roblox User',
      profile: 'https://www.roblox.com/users/777/profile',
      picture: null,
    });
    mockLinkPlatformToUser.mockRejectedValue(
      new AppError('CONFLICT_ACCOUNT_PROVIDER', 'Roblox account already linked', 409)
    );
    mockMergeProviderShadowUserIntoRobloxUser.mockResolvedValue({
      merged: true,
      mergedUserId: 'user-roblox-existing',
      reasonCode: 'MERGED',
    });
    mockGetUserById.mockResolvedValue({
      id: 'user-roblox-existing',
      robloxUserId: '777',
      robloxUsername: 'roblox-user',
      tokenVersion: 3,
      status: 'ACTIVE',
    });

    const start = await request(app.server)
      .get('/api/auth/roblox/start')
      .set('Authorization', 'Bearer fake-token');

    const response = await request(app.server)
      .post('/api/auth/roblox/callback')
      .set('Authorization', 'Bearer fake-token')
      .send({ code: 'oauth-code', state: start.body.state });

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.mergedFromUserId).toBe('user-google-1');
    expect(response.body.mergedToUserId).toBe('user-roblox-existing');
    expect(response.body.accessToken).toBe('access-after-merge');
    expect(response.body.refreshToken).toBe('refresh-after-merge');
    expect(mockGenerateTokens).toHaveBeenCalledTimes(1);
    expect(mockSaveConnection).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-roblox-existing' }));
  });
});
