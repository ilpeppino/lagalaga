import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { AuthError, ErrorCodes } from '../utils/errors.js';

interface AppleJwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

interface AppleKeysResponse {
  keys: AppleJwk[];
}

export interface AppleIdentityTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
  nonce?: string;
  nonce_supported?: boolean;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function parseCacheTtlSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 3600;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 3600;
  const ttl = Number(match[1]);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 3600;
}

export class AppleAuthService {
  private keysCache: { expiresAt: number; keys: AppleJwk[] } | null = null;

  private async getAppleKeys(): Promise<AppleJwk[]> {
    const now = Date.now();
    if (this.keysCache && this.keysCache.expiresAt > now) {
      return this.keysCache.keys;
    }

    const response = await fetch('https://appleid.apple.com/auth/keys');
    if (!response.ok) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Failed to fetch Apple signing keys');
    }

    const body = (await response.json()) as AppleKeysResponse;
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple signing keys response is invalid');
    }

    const ttlSeconds = parseCacheTtlSeconds(response.headers.get('cache-control'));
    this.keysCache = {
      keys: body.keys,
      expiresAt: now + ttlSeconds * 1000,
    };

    return body.keys;
  }

  async verifyIdentityToken(identityToken: string, audiences: string[]): Promise<AppleIdentityTokenPayload> {
    if (!identityToken || typeof identityToken !== 'string') {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Missing Apple identity token');
    }

    const tokenParts = identityToken.split('.');
    if (tokenParts.length !== 3) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid Apple identity token format');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = tokenParts;

    let header: JwtHeader;
    let payload: AppleIdentityTokenPayload;
    try {
      header = JSON.parse(decodeBase64Url(encodedHeader)) as JwtHeader;
      payload = JSON.parse(decodeBase64Url(encodedPayload)) as AppleIdentityTokenPayload;
    } catch {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Failed to decode Apple identity token');
    }

    if (header.alg !== 'RS256' || !header.kid) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple identity token header is invalid');
    }

    const keys = await this.getAppleKeys();
    const signingKey = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
    if (!signingKey) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'No matching Apple signing key');
    }

    const publicKey = createPublicKey({ key: signingKey as any, format: 'jwk' });
    const signedData = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8');
    const signature = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const isValidSignature = verifySignature('RSA-SHA256', signedData, publicKey, signature);
    if (!isValidSignature) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple identity token signature is invalid');
    }

    if (payload.iss !== 'https://appleid.apple.com') {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple identity token issuer is invalid');
    }

    if (!audiences.includes(payload.aud)) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple identity token audience is invalid');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple identity token is expired');
    }

    if (!payload.sub) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Apple identity token subject is missing');
    }

    return payload;
  }
}
