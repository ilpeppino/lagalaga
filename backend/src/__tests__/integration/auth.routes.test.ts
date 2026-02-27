import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGenerateAuthorizationUrl = jest.fn<any>();
const mockExchangeCode = jest.fn<any>();
const mockGetUserInfo = jest.fn<any>();
const mockVerifyAppleIdentityToken = jest.fn<any>();
const mockVerifyGoogleIdentityToken = jest.fn<any>();

const mockUpsertUser = jest.fn<any>();
const mockUpsertAppleUser = jest.fn<any>();
const mockUpsertGoogleUser = jest.fn<any>();
const mockGetUserById = jest.fn<any>();

const mockSaveConnection = jest.fn<any>();
const mockGenerateTokens = jest.fn<any>();
const mockVerifyRefreshToken = jest.fn<any>();
const mockSyncRobloxCacheBestEffort = jest.fn<any>();

const mockGenerateSignedOAuthState = jest.fn<any>();
const mockVerifySignedOAuthState = jest.fn<any>();
const mockIsValidCodeVerifier = jest.fn<any>();

jest.unstable_mockModule('../../services/robloxOAuth.js', () => ({
  RobloxOAuthService: class {
    generateAuthorizationUrl = mockGenerateAuthorizationUrl;
    exchangeCode = mockExchangeCode;
    getUserInfo = mockGetUserInfo;
  },
}));

jest.unstable_mockModule('../../services/apple-auth.service.js', () => ({
  AppleAuthService: class {
    verifyIdentityToken = mockVerifyAppleIdentityToken;
  },
}));

jest.unstable_mockModule('../../services/google-auth.service.js', () => ({
  GoogleAuthService: class {
    verifyIdentityToken = mockVerifyGoogleIdentityToken;
  },
}));

jest.unstable_mockModule('../../services/userService.js', () => ({
  UserService: class {
    upsertUser = mockUpsertUser;
    upsertAppleUser = mockUpsertAppleUser;
    upsertGoogleUser = mockUpsertGoogleUser;
    getUserById = mockGetUserById;
  },
}));

jest.unstable_mockModule('../../services/roblox-connection.service.js', () => ({
  RobloxConnectionService: class {
    saveConnection = mockSaveConnection;
  },
}));

jest.unstable_mockModule('../../services/tokenService.js', () => ({
  TokenService: class {
    generateTokens = mockGenerateTokens;
    verifyRefreshToken = mockVerifyRefreshToken;
  },
}));

jest.unstable_mockModule('../../services/friendship.service.js', () => ({
  FriendshipService: class {
    syncRobloxCacheBestEffort = mockSyncRobloxCacheBestEffort;
  },
}));

jest.unstable_mockModule('../../utils/crypto.js', () => ({
  generateSignedOAuthState: mockGenerateSignedOAuthState,
  verifySignedOAuthState: mockVerifySignedOAuthState,
  isValidCodeVerifier: mockIsValidCodeVerifier,
}));

const { authRoutes } = await import('../../routes/auth.js');
const { errorHandlerPlugin } = await import('../../plugins/errorHandler.js');
const { rateLimitPlugin } = await import('../../plugins/rate-limit.js');
const { AuthError, ErrorCodes } = await import('../../utils/errors.js');

function buildConfig() {
  return {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret',
    JWT_EXPIRY: '15m',
    REFRESH_TOKEN_SECRET: 'test-refresh-secret',
    REFRESH_TOKEN_EXPIRY: '7d',
    ROBLOX_CLIENT_ID: 'roblox-client-id',
    ROBLOX_CLIENT_SECRET: 'roblox-client-secret',
    ROBLOX_REDIRECT_URI: 'lagalaga://oauth/callback',
    APPLE_AUDIENCE: 'com.ilpeppino.lagalaga,com.ilpeppino.lagalaga.dev',
    GOOGLE_AUDIENCE: 'android-client.apps.googleusercontent.com,web-client.apps.googleusercontent.com',
  };
}

describe('auth routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGenerateSignedOAuthState.mockReturnValue('signed-state');
    mockGenerateAuthorizationUrl.mockReturnValue('https://apis.roblox.com/oauth/v1/authorize?x=1');

    app = Fastify({ logger: false });
    (app as any).config = buildConfig();
    await app.register(rateLimitPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(authRoutes, { prefix: '/auth' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/roblox/start returns authorization url + state', async () => {
    const response = await request(app.server)
      .post('/auth/roblox/start')
      .send({ codeChallenge: 'valid-code-challenge' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authorizationUrl: 'https://apis.roblox.com/oauth/v1/authorize?x=1',
      state: 'signed-state',
    });
    expect(mockGenerateSignedOAuthState).toHaveBeenCalledWith('test-jwt-secret');
    expect(mockGenerateAuthorizationUrl).toHaveBeenCalledWith('signed-state', 'valid-code-challenge');
  });

  it('POST /auth/roblox/callback rejects invalid state', async () => {
    mockVerifySignedOAuthState.mockReturnValue(false);

    const response = await request(app.server)
      .post('/auth/roblox/callback')
      .send({
        code: 'code-123',
        state: 'bad-state',
        codeVerifier: 'v'.repeat(43),
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_003');
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('POST /auth/roblox/callback rejects invalid code verifier', async () => {
    mockVerifySignedOAuthState.mockReturnValue(true);
    mockIsValidCodeVerifier.mockReturnValue(false);

    const response = await request(app.server)
      .post('/auth/roblox/callback')
      .send({
        code: 'code-123',
        state: 'signed-state',
        codeVerifier: 'invalid',
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_001');
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('POST /auth/roblox/callback returns tokens + user for valid payload', async () => {
    mockVerifySignedOAuthState.mockReturnValue(true);
    mockIsValidCodeVerifier.mockReturnValue(true);
    mockExchangeCode.mockResolvedValue({ access_token: 'roblox-access-token' });
    mockGetUserInfo.mockResolvedValue({
      sub: '12345',
      name: 'roblox-name',
      preferred_username: 'roblox-username',
      nickname: 'Roblox Display',
      profile: 'https://www.roblox.com/users/12345/profile',
    });
    mockUpsertUser.mockResolvedValue({
      id: 'user-1',
      robloxUserId: '12345',
      robloxUsername: 'roblox-username',
      robloxDisplayName: 'Roblox Display',
      robloxProfileUrl: 'https://www.roblox.com/users/12345/profile',
      tokenVersion: 3,
      status: 'ACTIVE',
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'app-access-token',
      refreshToken: 'app-refresh-token',
    });

    const response = await request(app.server)
      .post('/auth/roblox/callback')
      .send({
        code: 'code-123',
        state: 'signed-state',
        codeVerifier: 'v'.repeat(43),
      });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('app-access-token');
    expect(response.body.refreshToken).toBe('app-refresh-token');
    expect(response.body.user).toMatchObject({
      id: 'user-1',
      robloxUserId: '12345',
      robloxUsername: 'roblox-username',
      robloxDisplayName: 'Roblox Display',
    });

    expect(mockExchangeCode).toHaveBeenCalledWith('code-123', 'v'.repeat(43));
    expect(mockGetUserInfo).toHaveBeenCalledWith('roblox-access-token');
    expect(mockUpsertUser).toHaveBeenCalledTimes(1);
    expect(mockSaveConnection).toHaveBeenCalledTimes(1);
    expect(mockSyncRobloxCacheBestEffort).toHaveBeenCalledWith('user-1');
    expect(mockGenerateTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      robloxUserId: '12345',
      robloxUsername: 'roblox-username',
      tokenVersion: 3,
    });
  });

  it('POST /auth/refresh returns new tokens for valid refresh token', async () => {
    mockVerifyRefreshToken.mockReturnValue({
      userId: 'user-1',
      robloxUserId: '12345',
      tokenVersion: 2,
    });
    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      robloxUserId: '12345',
      robloxUsername: 'roblox-username',
      tokenVersion: 2,
      status: 'ACTIVE',
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const response = await request(app.server)
      .post('/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(mockVerifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
    expect(mockGetUserById).toHaveBeenCalledWith('user-1');
  });

  it('POST /auth/apple returns tokens + user for valid payload', async () => {
    mockVerifyAppleIdentityToken.mockResolvedValue({
      sub: 'apple-sub-1',
      aud: 'com.ilpeppino.lagalaga',
      iss: 'https://appleid.apple.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'relay@privaterelay.appleid.com',
      is_private_email: true,
    });
    mockUpsertAppleUser.mockResolvedValue({
      id: 'apple-user-1',
      robloxUserId: 'apple:apple-sub-1',
      robloxUsername: 'relay',
      robloxDisplayName: 'Relay User',
      robloxProfileUrl: null,
      tokenVersion: 1,
      status: 'ACTIVE',
      appleEmailIsPrivate: true,
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'apple-access-token',
      refreshToken: 'apple-refresh-token',
    });

    const response = await request(app.server)
      .post('/auth/apple')
      .send({
        identityToken: 'identity-token',
        authorizationCode: 'auth-code',
        fullName: {
          givenName: 'Relay',
          familyName: 'User',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('apple-access-token');
    expect(response.body.refreshToken).toBe('apple-refresh-token');
    expect(mockVerifyAppleIdentityToken).toHaveBeenCalledWith('identity-token', [
      'com.ilpeppino.lagalaga',
      'com.ilpeppino.lagalaga.dev',
    ]);
    expect(mockUpsertAppleUser).toHaveBeenCalledWith({
      appleSub: 'apple-sub-1',
      email: 'relay@privaterelay.appleid.com',
      fullName: 'Relay User',
      isPrivateEmail: true,
    });
    expect(mockGenerateTokens).toHaveBeenCalledWith({
      userId: 'apple-user-1',
      robloxUserId: 'apple:apple-sub-1',
      robloxUsername: 'relay',
      tokenVersion: 1,
    });
  });

  it('POST /auth/apple rejects invalid token', async () => {
    mockVerifyAppleIdentityToken.mockRejectedValue(
      new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'invalid')
    );

    const response = await request(app.server)
      .post('/auth/apple')
      .send({
        identityToken: 'bad-token',
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_001');
    expect(mockUpsertAppleUser).not.toHaveBeenCalled();
  });

  it('POST /auth/google returns tokens + user for valid payload', async () => {
    mockVerifyGoogleIdentityToken.mockResolvedValue({
      sub: 'google-sub-1',
      email: 'user@example.com',
      emailVerified: true,
      fullName: 'Google User',
      audience: 'android-client.apps.googleusercontent.com',
    });
    mockUpsertGoogleUser.mockResolvedValue({
      id: 'google-user-1',
      robloxUserId: 'google:google-sub-1',
      robloxUsername: 'google_user',
      robloxDisplayName: 'Google User',
      robloxProfileUrl: null,
      tokenVersion: 5,
      status: 'ACTIVE',
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
    });

    const response = await request(app.server)
      .post('/auth/google')
      .send({
        identityToken: 'google-id-token',
      });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('google-access-token');
    expect(response.body.refreshToken).toBe('google-refresh-token');
    expect(mockVerifyGoogleIdentityToken).toHaveBeenCalledWith('google-id-token', [
      'android-client.apps.googleusercontent.com',
      'web-client.apps.googleusercontent.com',
    ]);
    expect(mockUpsertGoogleUser).toHaveBeenCalledWith({
      googleSub: 'google-sub-1',
      email: 'user@example.com',
      fullName: 'Google User',
      emailVerified: true,
    });
  });

  it('POST /auth/refresh returns token expired error for invalid refresh token', async () => {
    mockVerifyRefreshToken.mockImplementation(() => {
      throw new Error('bad token');
    });

    const response = await request(app.server)
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid-refresh-token' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_002');
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('POST /auth/roblox/start returns 429 after per-route threshold is exceeded', async () => {
    for (let i = 0; i < 5; i += 1) {
      const okResponse = await request(app.server)
        .post('/auth/roblox/start')
        .send({ codeChallenge: `valid-code-challenge-${i}` });
      expect(okResponse.status).toBe(200);
    }

    const limitedResponse = await request(app.server)
      .post('/auth/roblox/start')
      .send({ codeChallenge: 'valid-code-challenge-6' });

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body?.error?.code).toBe('RATE_001');
  });
});
