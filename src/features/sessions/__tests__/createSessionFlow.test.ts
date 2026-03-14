import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAutoSessionTitle,
  buildAvailableFriends,
  buildFriendSearchResults,
  getFavoritePlaceId,
  parseRobloxPlaceIdFromUrl,
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
test('buildAutoSessionTitle prefers display name and game name', () => {
  assert.equal(
    buildAutoSessionTitle({ robloxDisplayName: 'Laga', robloxUsername: 'laga_user', gameName: 'Arsenal' }),
    "Laga's Arsenal session"
  );
});

test('buildAutoSessionTitle falls back to username', () => {
  assert.equal(
    buildAutoSessionTitle({ robloxUsername: 'laga_user', gameName: 'Arsenal' }),
    "laga_user's Arsenal session"
  );
});

test('buildAutoSessionTitle falls back safely', () => {
  assert.equal(buildAutoSessionTitle({}), 'Your Roblox session');
});

// ---------------------------------------------------------------------------
// combineDateAndTime
// ---------------------------------------------------------------------------
test('combineDateAndTime merges local date + local time', () => {
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
test('buildScheduledStartIso returns undefined for now mode', () => {
  const iso = buildScheduledStartIso({
    startMode: 'now',
    scheduledDate: new Date(2026, 2, 20),
    scheduledTime: new Date(2026, 2, 20, 10, 30),
  });
  assert.equal(iso, undefined);
});

test('buildScheduledStartIso returns ISO for scheduled mode', () => {
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
test('buildSelectedFriendsMap keeps selected ID order', () => {
  const selected = buildSelectedFriendsMap(friends, [3, 1]);
  assert.deepEqual(selected.map((f) => f.id), [3, 1]);
});

test('buildSelectedFriendsMap ignores IDs not in friend list', () => {
  const selected = buildSelectedFriendsMap(friends, [99, 2]);
  assert.deepEqual(selected.map((f) => f.id), [2]);
});

// ---------------------------------------------------------------------------
// buildAvailableFriends
// ---------------------------------------------------------------------------
test('buildAvailableFriends excludes selected and applies search', () => {
  const available = buildAvailableFriends({ friends, selectedIds: [1], searchQuery: 'ha' });
  assert.deepEqual(available.map((f) => f.id), [3]);
});

// ---------------------------------------------------------------------------
// buildFriendSearchResults
// ---------------------------------------------------------------------------
test('buildFriendSearchResults returns all when query empty and applies limit', () => {
  const results = buildFriendSearchResults({ friends, searchQuery: '', limit: 2 });
  assert.deepEqual(results.map((f) => f.id), [1, 2]);
});

test('buildFriendSearchResults filters by display name or username', () => {
  const results = buildFriendSearchResults({ friends, searchQuery: 'brav' });
  assert.deepEqual(results.map((f) => f.id), [2]);
});

test('buildFriendSearchResults prioritizes prefix matches and sorts deterministically', () => {
  const unorderedFriends = [
    { id: 30, name: 'xchar', displayName: 'xchar', avatarUrl: null },
    { id: 10, name: 'charles', displayName: 'Charles', avatarUrl: null },
    { id: 20, name: 'alpha', displayName: 'Alpha', avatarUrl: null },
    { id: 40, name: 'charlotte', displayName: 'charlotte', avatarUrl: null },
  ];
  const results = buildFriendSearchResults({ friends: unorderedFriends, searchQuery: 'char' });
  assert.deepEqual(results.map((f) => f.id), [10, 40, 30]);
});

test('parseRobloxPlaceIdFromUrl reads placeId from canonical games URL', () => {
  const placeId = parseRobloxPlaceIdFromUrl('https://www.roblox.com/games/123456789/My-Game');
  assert.equal(placeId, 123456789);
});

test('parseRobloxPlaceIdFromUrl reads placeId from query parameter', () => {
  const placeId = parseRobloxPlaceIdFromUrl('https://www.roblox.com/games/start?placeId=555777');
  assert.equal(placeId, 555777);
});

test('getFavoritePlaceId prefers URL placeId and falls back to ID', () => {
  assert.equal(
    getFavoritePlaceId({
      id: '42',
      url: 'https://www.roblox.com/games/999/Preferred',
    }),
    999
  );

  assert.equal(
    getFavoritePlaceId({
      id: '1234',
      url: undefined,
    }),
    1234
  );
});
