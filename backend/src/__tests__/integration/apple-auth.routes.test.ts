import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Fastify from 'fastify';
import request from 'supertest';
import { AppError, AuthError } from '../../utils/errors.js';

const mockAppleValidateIdentityToken = jest.fn<any>();
const mockResolveUserForAppleLogin = jest.fn<any>();
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

jest.unstable_mockModule('../../services/appleOAuth.js', () => ({
  AppleOAuthService: class {
    validateIdentityToken = mockAppleValidateIdentityToken;
  },
}));

jest.unstable_mockModule('../../services/apple-auth.service.js', () => ({
  AppleAuthService: class {
    resolveUserForAppleLogin = mockResolveUserForAppleLogin;
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
    APPLE_BUNDLE_ID: 'com.ilpeppino.lagalaga',
    APPLE_AUDIENCE: '',
    APPLE_ISSUER: 'https://appleid.apple.com',
    APPLE_JWKS_URI: '',
  };
}

describe('apple auth routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    jest.clearAllMocks();

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

  it('POST /api/auth/apple/callback validates identity token and returns app tokens', async () => {
    mockAppleValidateIdentityToken.mockResolvedValue({
      sub: 'apple-sub-1',
      iss: 'https://appleid.apple.com',
      aud: 'com.ilpeppino.lagalaga',
      email: 'user@example.com',
    });
    mockResolveUserForAppleLogin.mockResolvedValue({
      id: 'user-apple-1',
      robloxUserId: null,
      robloxUsername: null,
      robloxDisplayName: null,
      status: 'ACTIVE',
      tokenVersion: 1,
    });
    mockGenerateTokens.mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const response = await request(app.server)
      .post('/api/auth/apple/callback')
      .send({
        identityToken: 'identity-token',
        email: 'user@example.com',
        givenName: 'Test',
        familyName: 'User',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'user-apple-1',
      },
    });
    expect(mockAppleValidateIdentityToken).toHaveBeenCalledWith('identity-token', undefined);
  });

  it('POST /api/auth/apple/callback returns oauth failure for invalid token', async () => {
    mockAppleValidateIdentityToken.mockRejectedValue(
      new AuthError('AUTH_004', 'Apple identity token validation failed')
    );

    const response = await request(app.server)
      .post('/api/auth/apple/callback')
      .send({ identityToken: 'bad-token' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_004');
    expect(mockResolveUserForAppleLogin).not.toHaveBeenCalled();
  });

  it('POST /api/auth/apple/callback returns CONFLICT_ACCOUNT_PROVIDER when provider is linked elsewhere', async () => {
    mockAppleValidateIdentityToken.mockResolvedValue({
      sub: 'apple-sub-conflict',
      iss: 'https://appleid.apple.com',
      aud: 'com.ilpeppino.lagalaga',
    });
    mockResolveUserForAppleLogin.mockRejectedValue(
      new AppError('CONFLICT_ACCOUNT_PROVIDER', 'Apple account already linked', 409, {
        metadata: { platformId: 'apple', action: 'use_original_login' },
      })
    );

    const response = await request(app.server)
      .post('/api/auth/apple/callback')
      .send({ identityToken: 'identity-token' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT_ACCOUNT_PROVIDER');
  });

  it('POST /api/auth/apple/callback blocks pending deletion users', async () => {
    mockAppleValidateIdentityToken.mockResolvedValue({
      sub: 'apple-sub-1',
      iss: 'https://appleid.apple.com',
      aud: 'com.ilpeppino.lagalaga',
    });
    mockResolveUserForAppleLogin.mockResolvedValue({
      id: 'user-apple-1',
      robloxUserId: null,
      robloxUsername: null,
      robloxDisplayName: null,
      status: 'PENDING_DELETION',
      tokenVersion: 1,
    });

    const response = await request(app.server)
      .post('/api/auth/apple/callback')
      .send({ identityToken: 'identity-token' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_006');
    expect(mockGenerateTokens).not.toHaveBeenCalled();
  });
});
