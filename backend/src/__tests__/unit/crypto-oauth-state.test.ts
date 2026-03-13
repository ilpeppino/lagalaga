import { describe, expect, it } from '@jest/globals';
import { decodeSignedOAuthState, generateSignedOAuthState } from '../../utils/crypto.js';

describe('generateSignedOAuthState', () => {
  it('preserves provided nonce in state payload', () => {
    const nonce = 'google-nonce-123';
    const state = generateSignedOAuthState('test-secret', 60_000, {
      nonce,
      codeVerifier: 'verifier',
    });

    const decoded = decodeSignedOAuthState<{ nonce: string; codeVerifier: string }>(state, 'test-secret');
    expect(decoded).not.toBeNull();
    expect(decoded?.nonce).toBe(nonce);
    expect(decoded?.codeVerifier).toBe('verifier');
  });

  it('generates nonce when not provided', () => {
    const state = generateSignedOAuthState('test-secret', 60_000, {
      codeVerifier: 'verifier',
    });

    const decoded = decodeSignedOAuthState<{ nonce: string; codeVerifier: string }>(state, 'test-secret');
    expect(decoded).not.toBeNull();
    expect(typeof decoded?.nonce).toBe('string');
    expect((decoded?.nonce ?? '').length).toBeGreaterThan(0);
  });
});
