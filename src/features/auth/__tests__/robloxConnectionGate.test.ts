import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRequireRobloxConnection } from '../robloxConnectionGate';

test('apple-only user requires Roblox connect gate', () => {
  const shouldGate = shouldRequireRobloxConnection({
    robloxConnected: false,
  });

  assert.equal(shouldGate, true);
});

test('linked user bypasses Roblox connect gate', () => {
  const shouldGate = shouldRequireRobloxConnection({
    robloxConnected: true,
  });

  assert.equal(shouldGate, false);
});

test('link success then refresh keeps Roblox gate disabled', () => {
  const beforeRefresh = shouldRequireRobloxConnection({
    robloxConnected: false,
  });
  const afterRefresh = shouldRequireRobloxConnection({
    robloxConnected: true,
  });

  assert.equal(beforeRefresh, true);
  assert.equal(afterRefresh, false);
});
