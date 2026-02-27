import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostLoginRoute, parseOAuthCallbackUrl } from '../oauthCallback';

test('parseOAuthCallbackUrl extracts code and state for Google callback deep link', () => {
  const result = parseOAuthCallbackUrl('lagalaga://auth/google?code=1&state=2', 'google');

  assert.deepEqual(result, { code: '1', state: '2' });
});

test('parseOAuthCallbackUrl returns null when code/state are missing', () => {
  const result = parseOAuthCallbackUrl('lagalaga://auth/google?code=1', 'google');

  assert.equal(result, null);
});

test('getPostLoginRoute sends users without Roblox link to connect screen', () => {
  const route = getPostLoginRoute(false);

  assert.equal(route, '/me');
});
