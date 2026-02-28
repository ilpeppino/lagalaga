import { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthError, ErrorCodes } from '../utils/errors.js';

export interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | 'true' | 'false';
  is_private_email?: boolean | 'true' | 'false';
  nonce?: string;
  iss: string;
  aud: string | string[];
}

export class AppleOAuthService {
  private jwksPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null;

  constructor(private readonly fastify: FastifyInstance) {}

  async validateIdentityToken(identityToken: string, nonce?: string): Promise<AppleIdTokenClaims> {
    const audiences = this.getAudiences();
    const issuer = this.fastify.config.APPLE_ISSUER.trim() || 'https://appleid.apple.com';
    const jwksUri = this.fastify.config.APPLE_JWKS_URI.trim() || 'https://appleid.apple.com/auth/keys';

    try {
      const jwks = await this.getJwks(jwksUri);
      const verified = await jwtVerify(identityToken, jwks, {
        issuer,
        audience: audiences,
      });
      const claims = verified.payload as unknown as AppleIdTokenClaims;

      if (nonce && claims.nonce && claims.nonce !== nonce) {
        throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid OAuth nonce');
      }

      if (!claims.sub) {
        throw new AuthError(ErrorCodes.AUTH_OAUTH_FAILED, 'Apple identity token missing sub');
      }

      return claims;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        ErrorCodes.AUTH_OAUTH_FAILED,
        `Apple identity token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private getAudiences(): string[] {
    const configured = this.fastify.config.APPLE_AUDIENCE.trim();
    if (configured.length > 0) {
      const values = configured.split(',').map((value) => value.trim()).filter(Boolean);
      if (values.length > 0) {
        return values;
      }
    }

    const bundleId = this.fastify.config.APPLE_BUNDLE_ID.trim();
    if (bundleId.length > 0) {
      return [bundleId];
    }

    throw new AuthError(
      ErrorCodes.AUTH_OAUTH_FAILED,
      'Apple audience is not configured'
    );
  }

  private async getJwks(jwksUri: string): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (!this.jwksPromise) {
      this.jwksPromise = Promise.resolve(createRemoteJWKSet(new URL(jwksUri)));
    }
    return this.jwksPromise;
  }
}
