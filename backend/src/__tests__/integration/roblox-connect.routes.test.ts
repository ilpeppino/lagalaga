import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGenerateAuthorizationUrl = jest.fn<any>();
const mockExchangeCode = jest.fn<any>();
const mockGetUserInfo = jest.fn<any>();
const mockSaveConnection = jest.fn<any>();
const mockGenerateSignedOAuthState = jest.fn<any>();
const mockVerifySignedOAuthState = jest.fn<any>();
const mockGenerateCodeChallenge = jest.fn<any>();

jest.unstable_mockModule('../../middleware/authenticate.js', () => ({
  authenticate: async (request: any) => {
    request.user = { userId: 'user-1' };
  },
}));

jest.unstable_mockModule('../../services/robloxOAuth.js', () => ({
  RobloxOAuthService: class {
    generateAuthorizationUrl = mockGenerateAuthorizationUrl;
    exchangeCode = mockExchangeCode;
    getUserInfo = mockGetUserInfo;
  },
}));

jest.unstable_mockModule('../../services/roblox-connection.service.js', () => ({
  RobloxConnectionService: class {
    saveConnection = mockSaveConnection;
  },
}));

jest.unstable_mockModule('../../utils/crypto.js', () => ({
  generateSignedOAuthState: mockGenerateSignedOAuthState,
  generateCodeChallenge: mockGenerateCodeChallenge,
  verifySignedOAuthState: mockVerifySignedOAuthState,
}));

const { robloxConnectRoutes } = await import('../../routes/roblox-connect.routes.js');
const { errorHandlerPlugin } = await import('../../plugins/errorHandler.js');

function buildConfig() {
  return {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret',
    ROBLOX_CLIENT_ID: 'roblox-client-id',
    ROBLOX_CLIENT_SECRET: 'roblox-client-secret',
    ROBLOX_REDIRECT_URI: 'lagalaga://auth/roblox',
  };
}

describe('roblox connect routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGenerateSignedOAuthState.mockReturnValue('signed-state');
    mockGenerateCodeChallenge.mockReturnValue('challenge-123');
    mockGenerateAuthorizationUrl.mockReturnValue('https://apis.roblox.com/oauth/v1/authorize?x=1');
    mockVerifySignedOAuthState.mockReturnValue(true);
    mockExchangeCode.mockResolvedValue({ access_token: 'roblox-access-token' });
    mockGetUserInfo.mockResolvedValue({
      sub: '12345',
      preferred_username: 'roblox-user',
      nickname: 'Roblox User',
      profile: 'https://www.roblox.com/users/12345/profile',
    });

    app = Fastify({ logger: false });
    (app as any).config = buildConfig();
    await app.register(errorHandlerPlugin);
    await app.register(robloxConnectRoutes, { prefix: '/api/auth' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/auth/roblox/start returns authorization url + state', async () => {
    const response = await request(app.server)
      .get('/api/auth/roblox/start');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authorizationUrl: 'https://apis.roblox.com/oauth/v1/authorize?x=1',
      state: 'signed-state',
    });
  });

  it('POST /api/auth/roblox/exchange exchanges code and persists Roblox connection', async () => {
    await request(app.server).get('/api/auth/roblox/start');

    const response = await request(app.server)
      .post('/api/auth/roblox/exchange')
      .send({
        code: 'code-123',
        state: 'signed-state',
      });

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(mockExchangeCode).toHaveBeenCalledWith('code-123', expect.any(String));
    expect(mockSaveConnection).toHaveBeenCalledTimes(1);
  });
});
