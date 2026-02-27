import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRobloxNotConnectedError } from '../robloxGateController';

test('ROBLOX_NOT_CONNECTED triggers navigation to connect gate', () => {
  const navigations: string[] = [];
  const didHandle = handleRobloxNotConnectedError(
    'ROBLOX_NOT_CONNECTED',
    '/sessions',
    (path) => navigations.push(path)
  );

  assert.equal(didHandle, true);
  assert.deepEqual(navigations, ['/me']);
});

test('does not redirect when already on connect screen to avoid loop', () => {
  const navigations: string[] = [];
  const didHandle = handleRobloxNotConnectedError(
    'ROBLOX_NOT_CONNECTED',
    '/me',
    (path) => navigations.push(path)
  );

  assert.equal(didHandle, false);
  assert.deepEqual(navigations, []);
});
