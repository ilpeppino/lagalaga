import crypto from 'crypto';

/**
 * Generate a random state parameter for OAuth CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a signed OAuth state token that can be validated statelessly.
 * Format: base64url(payload).base64url(signature)
 */
export function generateSignedOAuthState(
  secret: string,
  ttlMs: number = 10 * 60 * 1000
): string {
  const now = Date.now();
  const payload = {
    nonce: generateState(),
    iat: now,
    exp: now + ttlMs,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verify signed OAuth state token integrity and expiry.
 */
export function verifySignedOAuthState(state: string, secret: string): boolean {
  const parts = state.split('.');
  if (parts.length !== 2) return false;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest();

  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }

  if (actualSignature.length !== expectedSignature.length) return false;
  if (!crypto.timingSafeEqual(actualSignature, expectedSignature)) return false;

  let payload: { exp?: number };
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
  } catch {
    return false;
  }

  if (typeof payload.exp !== 'number') return false;
  return Date.now() <= payload.exp;
}

/**
 * Verify PKCE code_verifier matches the expected format
 * Must be 43-128 characters using [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
export function isValidCodeVerifier(verifier: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }
  return /^[A-Za-z0-9\-._~]+$/.test(verifier);
}

/**
 * Generate SHA256 hash of code_verifier for PKCE validation
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}
