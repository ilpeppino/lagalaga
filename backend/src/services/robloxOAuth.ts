import { FastifyInstance } from 'fastify';
import { request } from 'undici';
import { AuthError, ErrorCodes } from '../utils/errors.js';

export interface RobloxTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

export interface RobloxUserInfo {
  sub: string; // Roblox user ID
  name: string; // Username
  nickname: string; // Display name
  preferred_username: string;
  created_at: number;
  profile: string; // Profile URL
  picture: string; // Avatar URL
}

export class RobloxOAuthService {
  private readonly tokenEndpoint = 'https://apis.roblox.com/oauth/v1/token';
  private readonly userInfoEndpoint = 'https://apis.roblox.com/oauth/v1/userinfo';
  private readonly authorizationEndpoint = 'https://apis.roblox.com/oauth/v1/authorize';

  constructor(private fastify: FastifyInstance) {}

  /**
   * Generate authorization URL for Roblox OAuth
   */
  generateAuthorizationUrl(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.fastify.config.ROBLOX_CLIENT_ID,
      redirect_uri: this.fastify.config.ROBLOX_REDIRECT_URI,
      scope: 'openid profile',
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(code: string, codeVerifier: string): Promise<RobloxTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.fastify.config.ROBLOX_CLIENT_ID,
      client_secret: this.fastify.config.ROBLOX_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.fastify.config.ROBLOX_REDIRECT_URI,
    });

    try {
      const response = await request(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (response.statusCode !== 200) {
        const errorData = await response.body.json();
        throw new AuthError(
          ErrorCodes.AUTH_OAUTH_FAILED,
          `Roblox token exchange failed: ${JSON.stringify(errorData)}`
        );
      }

      return await response.body.json() as RobloxTokenResponse;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        ErrorCodes.AUTH_OAUTH_FAILED,
        `Failed to exchange code: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<RobloxTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.fastify.config.ROBLOX_CLIENT_ID,
      client_secret: this.fastify.config.ROBLOX_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: this.fastify.config.ROBLOX_REDIRECT_URI,
    });

    try {
      const response = await request(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (response.statusCode !== 200) {
        const errorData = await response.body.json();
        throw new AuthError(
          ErrorCodes.AUTH_OAUTH_FAILED,
          `Roblox token refresh failed: ${JSON.stringify(errorData)}`
        );
      }

      return await response.body.json() as RobloxTokenResponse;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        ErrorCodes.AUTH_OAUTH_FAILED,
        `Failed to refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get user info from Roblox using access token
   */
  async getUserInfo(accessToken: string): Promise<RobloxUserInfo> {
    try {
      const response = await request(this.userInfoEndpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.statusCode !== 200) {
        const errorData = await response.body.json();
        throw new AuthError(
          ErrorCodes.AUTH_OAUTH_FAILED,
          `Failed to get user info: ${JSON.stringify(errorData)}`
        );
      }

      return await response.body.json() as RobloxUserInfo;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        ErrorCodes.AUTH_OAUTH_FAILED,
        `Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decode ID token (JWT) without verification
   * In production, you should verify the signature
   */
  decodeIdToken(idToken: string): any {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
      return JSON.parse(payload);
    } catch (error) {
      throw new AuthError(
        ErrorCodes.AUTH_OAUTH_FAILED,
        'Failed to decode ID token'
      );
    }
  }
}
