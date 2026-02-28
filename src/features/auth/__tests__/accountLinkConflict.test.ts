import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAccountLinkConflict } from '../accountLinkConflict';

test('ACCOUNT_LINK_CONFLICT maps to friendly message and sign-in action', () => {
  const result = resolveAccountLinkConflict(
    { code: 'ACCOUNT_LINK_CONFLICT' },
    'roblox'
  );

  assert.equal(result.handled, true);
  assert.equal(result.shouldNavigateToSignIn, true);
  assert.equal(result.title, 'Account already linked');
  assert.match(result.message, /already linked/i);
});

test('CONFLICT_ACCOUNT_PROVIDER maps to friendly message and sign-in action', () => {
  const result = resolveAccountLinkConflict(
    { code: 'CONFLICT_ACCOUNT_PROVIDER' },
    'apple'
  );

  assert.equal(result.handled, true);
  assert.equal(result.shouldNavigateToSignIn, true);
  assert.equal(result.title, 'Account already linked');
  assert.match(result.message, /already linked/i);
});

test('non-conflict error does not trigger conflict UX', () => {
  const result = resolveAccountLinkConflict(
    { code: 'AUTH_004' },
    'roblox'
  );

  assert.equal(result.handled, false);
  assert.equal(result.shouldNavigateToSignIn, false);
});
