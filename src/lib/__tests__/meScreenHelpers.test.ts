import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHaloColor } from '../meHelpers';

// ---------------------------------------------------------------------------
// resolveHaloColor — avatar halo color based on connection + sync state
// ---------------------------------------------------------------------------
test('resolveHaloColor: connected and idle → green', () => {
  assert.equal(resolveHaloColor({ connected: true, syncing: false }), '#34c759');
});

test('resolveHaloColor: syncing (regardless of connected) → blue', () => {
  assert.equal(resolveHaloColor({ connected: true, syncing: true }), '#0a7ea4');
});

test('resolveHaloColor: disconnected and idle → grey', () => {
  assert.equal(resolveHaloColor({ connected: false, syncing: false }), '#8e8e93');
});
