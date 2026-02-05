import crypto from 'crypto';

/**
 * Generate a random state parameter for OAuth CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
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
