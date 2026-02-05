import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * Generate a random code verifier for PKCE
 * Must be 43-128 characters using [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
export function generateCodeVerifier(): string {
  const randomBytes = Crypto.getRandomBytes(32);
  return base64urlEncode(randomBytes);
}

/**
 * Generate code challenge from verifier
 * code_challenge = BASE64URL(SHA256(code_verifier))
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  if (Platform.OS === 'web') {
    // Use Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return base64urlEncode(new Uint8Array(hashArray));
  } else {
    // Use expo-crypto
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    );
    // Convert base64 to base64url
    return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateRandomState(): string {
  const randomBytes = Crypto.getRandomBytes(32);
  return base64urlEncode(randomBytes);
}

/**
 * Convert Uint8Array to base64url encoding
 */
function base64urlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
