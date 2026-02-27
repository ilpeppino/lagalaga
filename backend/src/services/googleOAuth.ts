import { FastifyInstance } from 'fastify';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { request } from 'undici';
import { AuthError, ErrorCodes } from '../utils/errors.js';

interface GoogleDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

export interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
  iss: string;
  aud: string | string[];
}

interface AuthorizationUrlInput {
  state: string;
  codeChallenge: string;
  nonce: string;
}

interface GoogleProviderConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export class GoogleOAuthService {
  private providerConfigPromise: Promise<GoogleProviderConfig> | null = null;
  private jwksPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null;

  constructor(private readonly fastify: FastifyInstance) {}

  async generateAuthorizationUrl(input: AuthorizationUrlInput): Promise<string> {
    const provider = await this.getProviderConfig();
    const params = new URLSearchParams({
      client_id: this.fastify.config.GOOGLE_CLIENT_ID,
      redirect_uri: this.fastify.config.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      nonce: input.nonce,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${provider.authorizationEndpoint}?${params.toString()}`;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    const provider = await this.getProviderConfig();
    const body = new URLSearchParams({
      code,
      client_id: this.fastify.config.GOOGLE_CLIENT_ID,
      grant_type: 'authorization_code',
      redirect_uri: this.fastify.config.GOOGLE_REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    if (this.fastify.config.GOOGLE_CLIENT_SECRET.trim()) {
      body.set('client_secret', this.fastify.config.GOOGLE_CLIENT_SECRET);
    }

    try {
      const response = await request(provider.tokenEndpoint, {
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
          `Google token exchange failed: ${JSON.stringify(errorData)}`
        );
      }

      const tokenResponse = await response.body.json() as GoogleTokenResponse;
      if (!tokenResponse.id_token) {
        throw new AuthError(ErrorCodes.AUTH_OAUTH_FAILED, 'Google response missing id_token');
      }

      return tokenResponse;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        ErrorCodes.AUTH_OAUTH_FAILED,
        `Failed to exchange Google auth code: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async validateIdToken(idToken: string, nonce?: string): Promise<GoogleIdTokenClaims> {
    try {
      const provider = await this.getProviderConfig();
      const jwks = await this.getJwks(provider.jwksUri);

      const verified = await jwtVerify(idToken, jwks, {
        audience: this.fastify.config.GOOGLE_CLIENT_ID,
      });

      const claims = verified.payload as unknown as GoogleIdTokenClaims;
      const configuredIssuer = this.fastify.config.GOOGLE_ISSUER.trim();
      const acceptedIssuers = new Set<string>([
        configuredIssuer,
        configuredIssuer.replace(/^https:\/\//, ''),
      ]);

      if (!acceptedIssuers.has(claims.iss)) {
        throw new AuthError(ErrorCodes.AUTH_OAUTH_FAILED, 'Invalid Google token issuer');
      }

      if (nonce && claims.nonce !== nonce) {
        throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid OAuth nonce');
      }

      if (!claims.sub) {
        throw new AuthError(ErrorCodes.AUTH_OAUTH_FAILED, 'Google ID token missing sub');
      }

      return claims;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        ErrorCodes.AUTH_OAUTH_FAILED,
        `Google ID token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async getProviderConfig(): Promise<GoogleProviderConfig> {
    if (!this.providerConfigPromise) {
      this.providerConfigPromise = this.loadProviderConfig();
    }
    return this.providerConfigPromise;
  }

  private async loadProviderConfig(): Promise<GoogleProviderConfig> {
    const issuer = this.fastify.config.GOOGLE_ISSUER.trim() || 'https://accounts.google.com';
    const discovered = await this.fetchDiscoveryDocument(issuer);

    return {
      authorizationEndpoint: discovered?.authorization_endpoint || 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: discovered?.token_endpoint || 'https://oauth2.googleapis.com/token',
      jwksUri: this.fastify.config.GOOGLE_JWKS_URI.trim() || discovered?.jwks_uri || 'https://www.googleapis.com/oauth2/v3/certs',
    };
  }

  private async fetchDiscoveryDocument(issuer: string): Promise<GoogleDiscoveryDocument | null> {
    try {
      const normalizedIssuer = issuer.replace(/\/+$/, '');
      const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;
      const response = await request(discoveryUrl, { method: 'GET' });

      if (response.statusCode !== 200) {
        return null;
      }

      return await response.body.json() as GoogleDiscoveryDocument;
    } catch {
      return null;
    }
  }

  private async getJwks(jwksUri: string): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (!this.jwksPromise) {
      this.jwksPromise = Promise.resolve(createRemoteJWKSet(new URL(jwksUri)));
    }
    return this.jwksPromise;
  }
}
