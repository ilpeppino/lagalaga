import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAutoSessionTitle,
  buildAvailableFriends,
  buildScheduledStartIso,
  buildSelectedFriendsMap,
  combineDateAndTime,
} from '../createSessionFlow';

const friends = [
  { id: 1, name: 'alpha', displayName: 'Alpha', avatarUrl: null },
  { id: 2, name: 'bravo', displayName: 'Bravo', avatarUrl: null },
  { id: 3, name: 'charlie', displayName: 'Charlie', avatarUrl: null },
];

// ---------------------------------------------------------------------------
// buildAutoSessionTitle
// ---------------------------------------------------------------------------
test('buildAutoSessionTitle: prefers display name and game name', () => {
  assert.equal(
    buildAutoSessionTitle({ robloxDisplayName: 'Laga', robloxUsername: 'laga_user', gameName: 'Arsenal' }),
    "Laga's Arsenal session"
  );
});

test('buildAutoSessionTitle: falls back to username when no displayName', () => {
  assert.equal(
    buildAutoSessionTitle({ robloxUsername: 'laga_user', gameName: 'Arsenal' }),
    "laga_user's Arsenal session"
  );
});

test('buildAutoSessionTitle: falls back safely when all inputs missing', () => {
  assert.equal(buildAutoSessionTitle({}), 'Your Roblox session');
});

// ---------------------------------------------------------------------------
// combineDateAndTime
// ---------------------------------------------------------------------------
test('combineDateAndTime: merges date parts from datePart and time parts from timePart', () => {
  const date = new Date(2026, 2, 20, 8, 0, 0, 0);
  const time = new Date(2026, 2, 14, 19, 45, 0, 0);
  const combined = combineDateAndTime(date, time);
  assert.equal(combined.getFullYear(), 2026);
  assert.equal(combined.getMonth(), 2);
  assert.equal(combined.getDate(), 20);
  assert.equal(combined.getHours(), 19);
  assert.equal(combined.getMinutes(), 45);
});

// ---------------------------------------------------------------------------
// buildScheduledStartIso
// ---------------------------------------------------------------------------
test('buildScheduledStartIso: returns undefined for now mode', () => {
  const iso = buildScheduledStartIso({
    startMode: 'now',
    scheduledDate: new Date(2026, 2, 20),
    scheduledTime: new Date(2026, 2, 20, 10, 30),
  });
  assert.equal(iso, undefined);
});

test('buildScheduledStartIso: returns ISO string for scheduled mode', () => {
  const iso = buildScheduledStartIso({
    startMode: 'scheduled',
    scheduledDate: new Date(2026, 2, 20),
    scheduledTime: new Date(2026, 2, 20, 14, 30),
  });
  assert.ok(typeof iso === 'string');
  const parsed = new Date(iso!);
  assert.equal(parsed.getDate(), 20);
  assert.equal(parsed.getHours(), 14);
  assert.equal(parsed.getMinutes(), 30);
});

// ---------------------------------------------------------------------------
// buildSelectedFriendsMap
// ---------------------------------------------------------------------------
test('buildSelectedFriendsMap: preserves selected ID order', () => {
  const selected = buildSelectedFriendsMap(friends, [3, 1]);
  assert.deepEqual(selected.map((f) => f.id), [3, 1]);
});

test('buildSelectedFriendsMap: ignores IDs not in friends list', () => {
  const selected = buildSelectedFriendsMap(friends, [99, 2]);
  assert.deepEqual(selected.map((f) => f.id), [2]);
});

// ---------------------------------------------------------------------------
// buildAvailableFriends
// ---------------------------------------------------------------------------
test('buildAvailableFriends: excludes selected IDs', () => {
  const available = buildAvailableFriends({ friends, selectedIds: [1, 2], searchQuery: '' });
  assert.deepEqual(available.map((f) => f.id), [3]);
});

test('buildAvailableFriends: filters by search query across name and displayName', () => {
  const available = buildAvailableFriends({ friends, selectedIds: [1], searchQuery: 'ha' });
  // 'charlie' contains 'ha', 'bravo' does not — selectedIds [1] removes alpha
  assert.deepEqual(available.map((f) => f.id), [3]);
});

test('buildAvailableFriends: empty search returns all non-selected', () => {
  const available = buildAvailableFriends({ friends, selectedIds: [], searchQuery: '' });
  assert.equal(available.length, 3);
});
