import { AuthError, ErrorCodes } from '../utils/errors.js';

interface GoogleTokenInfoResponse {
  aud?: string;
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  iss?: string;
  exp?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
}

export interface GoogleIdentityTokenPayload {
  sub: string;
  email?: string;
  emailVerified: boolean;
  fullName?: string;
  audience: string;
}

export class GoogleAuthService {
  async verifyIdentityToken(identityToken: string, audiences: string[]): Promise<GoogleIdentityTokenPayload> {
    if (!identityToken || typeof identityToken !== 'string') {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Missing Google identity token');
    }

    if (audiences.length === 0) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Google sign-in is not configured');
    }

    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(identityToken)}`
    );
    if (!response.ok) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Failed to validate Google identity token');
    }

    const tokenInfo = (await response.json()) as GoogleTokenInfoResponse;
    if (!tokenInfo.sub || !tokenInfo.aud || !tokenInfo.exp || !tokenInfo.iss) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Google identity token payload is invalid');
    }

    if (!audiences.includes(tokenInfo.aud)) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Google identity token audience is invalid');
    }

    if (tokenInfo.iss !== 'accounts.google.com' && tokenInfo.iss !== 'https://accounts.google.com') {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Google identity token issuer is invalid');
    }

    const exp = Number(tokenInfo.exp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(exp) || exp <= nowSeconds) {
      throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Google identity token is expired');
    }

    const fullName = tokenInfo.name
      || [tokenInfo.given_name, tokenInfo.family_name].filter(Boolean).join(' ').trim()
      || undefined;

    return {
      sub: tokenInfo.sub,
      email: tokenInfo.email,
      emailVerified: tokenInfo.email_verified === 'true',
      fullName,
      audience: tokenInfo.aud,
    };
  }
}
