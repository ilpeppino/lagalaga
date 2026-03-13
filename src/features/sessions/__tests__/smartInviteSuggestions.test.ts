import assert from 'node:assert/strict';
import test from 'node:test';
import { rankInviteSuggestions } from '../smartInviteSuggestions';
import type { RobloxFriend, RobloxFriendPresence } from '../types-v2';

function makeFriend(id: number, displayName = `User${id}`): RobloxFriend {
  return { id, name: `user${id}`, displayName, avatarUrl: null };
}

function makePresence(presenceType: 0 | 1 | 2 | 3): RobloxFriendPresence {
  return {
    userPresenceType: presenceType,
    lastLocation: null,
    placeId: null,
    universeId: null,
    gameId: null,
    lastOnline: null,
  };
}

test('online friends ranked above offline', () => {
  const friends = [makeFriend(1), makeFriend(2)];
  const presenceMap = new Map<number, RobloxFriendPresence>([
    [1, makePresence(0)], // offline
    [2, makePresence(1)], // online
  ]);
  const result = rankInviteSuggestions({
    friends,
    presenceMap,
    recentlyInvitedIds: [],
    excludeIds: [],
  });
  assert.equal(result[0].friend.id, 2);
  assert.equal(result[0].reason, 'online_now');
});

test('online (lobby) ranked above in_game (already playing)', () => {
  // Spec priority: online first, then in-game.
  // "Online" = in Roblox menus, free to join. "In game" = already playing.
  const friends = [makeFriend(1), makeFriend(2)];
  const presenceMap = new Map<number, RobloxFriendPresence>([
    [1, makePresence(2)], // in_game
    [2, makePresence(1)], // online (lobby)
  ]);
  const result = rankInviteSuggestions({
    friends,
    presenceMap,
    recentlyInvitedIds: [],
    excludeIds: [],
  });
  assert.equal(result[0].friend.id, 2);
  assert.equal(result[0].reason, 'online_now');
});

test('recently invited offline friend boosted above plain offline', () => {
  const friends = [makeFriend(1), makeFriend(2)];
  const presenceMap = new Map<number, RobloxFriendPresence>([
    [1, makePresence(0)],
    [2, makePresence(0)],
  ]);
  const result = rankInviteSuggestions({
    friends,
    presenceMap,
    recentlyInvitedIds: [2],
    excludeIds: [],
  });
  assert.equal(result[0].friend.id, 2);
  assert.equal(result[0].reason, 'played_with_you');
});

test('recently invited friend who is also online keeps online label', () => {
  const friends = [makeFriend(1)];
  const presenceMap = new Map<number, RobloxFriendPresence>([
    [1, makePresence(1)],
  ]);
  const result = rankInviteSuggestions({
    friends,
    presenceMap,
    recentlyInvitedIds: [1],
    excludeIds: [],
  });
  // online label takes priority over played_with_you when already online
  assert.equal(result[0].reason, 'online_now');
  // But score is higher than plain online
  assert.ok(result[0].score > 100);
});

test('excluded IDs are not returned', () => {
  const friends = [makeFriend(1), makeFriend(2), makeFriend(3)];
  const presenceMap = new Map<number, RobloxFriendPresence>();
  const result = rankInviteSuggestions({
    friends,
    presenceMap,
    recentlyInvitedIds: [],
    excludeIds: [2],
  });
  assert.ok(result.every((s) => s.friend.id !== 2));
});

test('limit caps the returned array', () => {
  const friends = Array.from({ length: 10 }, (_, i) => makeFriend(i + 1));
  const presenceMap = new Map<number, RobloxFriendPresence>();
  const result = rankInviteSuggestions({
    friends,
    presenceMap,
    recentlyInvitedIds: [],
    excludeIds: [],
    limit: 3,
  });
  assert.equal(result.length, 3);
});

test('empty friends list returns empty array', () => {
  const result = rankInviteSuggestions({
    friends: [],
    presenceMap: new Map(),
    recentlyInvitedIds: [],
    excludeIds: [],
  });
  assert.equal(result.length, 0);
});

test('friend with no presence entry treated as offline', () => {
  const friends = [makeFriend(1)];
  const presenceMap = new Map<number, RobloxFriendPresence>(); // empty
  const result = rankInviteSuggestions({
    friends,
    presenceMap,
    recentlyInvitedIds: [],
    excludeIds: [],
  });
  assert.equal(result[0].reason, 'friend');
});

test('reason label for played_with_you is human readable', () => {
  const friends = [makeFriend(1)];
  const result = rankInviteSuggestions({
    friends,
    presenceMap: new Map(),
    recentlyInvitedIds: [1],
    excludeIds: [],
  });
  assert.equal(result[0].reasonLabel, 'Played with you');
});

test('all excluded → empty result', () => {
  const friends = [makeFriend(1), makeFriend(2)];
  const result = rankInviteSuggestions({
    friends,
    presenceMap: new Map(),
    recentlyInvitedIds: [],
    excludeIds: [1, 2],
  });
  assert.equal(result.length, 0);
});
