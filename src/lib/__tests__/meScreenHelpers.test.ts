import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveConnectorDotColor,
  resolveHaloColor,
  resolveSyncA11yLabel,
  resolveSyncIconName,
} from '../meHelpers';

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

test('resolveHaloColor: syncError (not syncing) → red', () => {
  assert.equal(resolveHaloColor({ connected: true, syncing: false, syncError: true }), '#ff3b30');
});

test('resolveHaloColor: syncing takes precedence over syncError → blue', () => {
  assert.equal(resolveHaloColor({ connected: true, syncing: true, syncError: true }), '#0a7ea4');
});

test('resolveConnectorDotColor: syncing → blue', () => {
  assert.equal(resolveConnectorDotColor({ syncing: true, syncError: false }), '#0a7ea4');
});

test('resolveConnectorDotColor: syncError takes precedence over syncing → red', () => {
  assert.equal(resolveConnectorDotColor({ syncing: true, syncError: true }), '#ff3b30');
});

test('resolveSyncIconName: success when idle → checkmark', () => {
  assert.equal(resolveSyncIconName({ syncing: false, feedback: 'success' }), 'checkmark');
});

test('resolveSyncIconName: while syncing stays refresh icon', () => {
  assert.equal(resolveSyncIconName({ syncing: true, feedback: 'success' }), 'arrow.clockwise');
});

test('resolveSyncA11yLabel: disconnected', () => {
  assert.equal(
    resolveSyncA11yLabel({ connected: false, syncing: false, feedback: 'idle' }),
    'Roblox not connected'
  );
});

test('resolveSyncA11yLabel: syncing label', () => {
  assert.equal(
    resolveSyncA11yLabel({ connected: true, syncing: true, feedback: 'idle' }),
    'Syncing Roblox data'
  );
});

test('resolveSyncA11yLabel: success label after sync completion', () => {
  assert.equal(
    resolveSyncA11yLabel({ connected: true, syncing: false, feedback: 'success' }),
    'Roblox sync complete'
  );
});

test('resolveSyncA11yLabel: error label after failed sync', () => {
  assert.equal(
    resolveSyncA11yLabel({ connected: true, syncing: false, feedback: 'error' }),
    'Roblox sync failed'
  );
});
