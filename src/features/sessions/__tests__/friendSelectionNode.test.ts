import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addFriendSelection,
  buildCreateSessionPayload,
  removeFriendSelection,
  toggleFriendSelection,
} from '../friendSelection';

test('addFriendSelection adds friend only once', () => {
  assert.deepEqual(addFriendSelection([], 10), [10]);
  assert.deepEqual(addFriendSelection([10], 10), [10]);
});

test('removeFriendSelection removes selected friend id', () => {
  assert.deepEqual(removeFriendSelection([10, 11], 11), [10]);
  assert.deepEqual(removeFriendSelection([10], 99), [10]);
});

test('toggleFriendSelection still supports fallback toggle behavior', () => {
  assert.deepEqual(toggleFriendSelection([], 55), [55]);
  assert.deepEqual(toggleFriendSelection([55], 55), []);
});

test('buildCreateSessionPayload keeps unique invited IDs', () => {
  const payload = buildCreateSessionPayload({
    robloxUrl: 'https://www.roblox.com/games/123',
    title: 'Session',
    selectedFriendIds: [3, 7, 3],
  });

  assert.deepEqual(payload.invitedRobloxUserIds, [3, 7]);
});
