import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostLoginRoute, parseGoogleCallbackPayload, parseOAuthCallbackUrl } from '../oauthCallback';

test('parseOAuthCallbackUrl extracts code and state for Google callback deep link', () => {
  const result = parseOAuthCallbackUrl('lagalaga://auth/google?code=1&state=2', 'google');

  assert.deepEqual(result, { code: '1', state: '2' });
});

test('parseOAuthCallbackUrl returns null when code/state are missing', () => {
  const result = parseOAuthCallbackUrl('lagalaga://auth/google?code=1', 'google');

  assert.equal(result, null);
});

test('parseGoogleCallbackPayload extracts deep-linked tokens', () => {
  const result = parseGoogleCallbackPayload('lagalaga://auth/google?accessToken=a&refreshToken=b');

  assert.deepEqual(result, {
    accessToken: 'a',
    refreshToken: 'b',
    code: undefined,
    state: undefined,
    error: undefined,
    errorCode: undefined,
  });
});

test('parseGoogleCallbackPayload extracts callback error params', () => {
  const result = parseGoogleCallbackPayload('lagalaga://auth/google?error=access_denied&errorCode=AUTH_004');

  assert.deepEqual(result, {
    accessToken: undefined,
    refreshToken: undefined,
    code: undefined,
    state: undefined,
    error: 'access_denied',
    errorCode: 'AUTH_004',
  });
});

test('parseGoogleCallbackPayload supports trailing slash and hash params', () => {
  const result = parseGoogleCallbackPayload('lagalaga://auth/google/#accessToken=a&refreshToken=b');

  assert.deepEqual(result, {
    accessToken: 'a',
    refreshToken: 'b',
    code: undefined,
    state: undefined,
    error: undefined,
    errorCode: undefined,
  });
});

test('getPostLoginRoute sends users without Roblox link to connect screen', () => {
  const route = getPostLoginRoute(false);

  assert.equal(route, '/auth/connect-roblox');
});
