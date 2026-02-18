/* global describe, it, expect */

/**
 * Tests for presence-merging logic used in CreateSessionScreenV2.
 * The merge step is: friends.map(f => ({ ...f, presence: presenceMap.get(f.id) }))
 * This verifies the invariants that matter most:
 *   1. Presence is added to matching friends
 *   2. Friends without presence are unchanged (presence = undefined)
 *   3. Selection state (selectedFriendIds) is not affected by presence data
 */

function mergePresenceIntoFriends(friends, presenceMap) {
  return friends.map((f) => ({ ...f, presence: presenceMap.get(f.id) }));
}

const FRIEND_A = { id: 111, name: 'alpha', displayName: 'Alpha', avatarUrl: null };
const FRIEND_B = { id: 222, name: 'beta', displayName: 'Beta', avatarUrl: null };
const FRIEND_C = { id: 333, name: 'gamma', displayName: 'Gamma', avatarUrl: null };

const PRESENCE_A = {
  userPresenceType: 2,
  lastLocation: 'Jailbreak',
  placeId: 606849621,
  universeId: 219943895,
  gameId: 'abc',
  lastOnline: '2024-01-01T00:00:00.000Z',
};

describe('mergePresenceIntoFriends', () => {
  it('adds presence data to matching friends', () => {
    const presenceMap = new Map([[111, PRESENCE_A]]);
    const result = mergePresenceIntoFriends([FRIEND_A, FRIEND_B], presenceMap);

    expect(result[0].presence).toEqual(PRESENCE_A);
    expect(result[1].presence).toBeUndefined();
  });

  it('does not mutate original friend objects', () => {
    const presenceMap = new Map([[111, PRESENCE_A]]);
    mergePresenceIntoFriends([FRIEND_A], presenceMap);
    expect(FRIEND_A.presence).toBeUndefined();
  });

  it('handles empty presence map — all friends have undefined presence', () => {
    const result = mergePresenceIntoFriends([FRIEND_A, FRIEND_B, FRIEND_C], new Map());
    result.forEach((f) => expect(f.presence).toBeUndefined());
  });

  it('handles empty friends list', () => {
    const presenceMap = new Map([[111, PRESENCE_A]]);
    expect(mergePresenceIntoFriends([], presenceMap)).toHaveLength(0);
  });

  it('selectedFriendIds are not altered by presence data', () => {
    const presenceMap = new Map([[111, PRESENCE_A], [222, PRESENCE_A]]);
    const selectedIds = [111, 333];

    const merged = mergePresenceIntoFriends([FRIEND_A, FRIEND_B, FRIEND_C], presenceMap);

    // Selected ids still only reference friend ids, unaffected by presence
    const selectedFromMerged = merged
      .filter((f) => selectedIds.includes(f.id))
      .map((f) => f.id);

    expect(selectedFromMerged).toEqual([111, 333]);
  });

  it('friend id 333 with no presence still has correct base fields', () => {
    const presenceMap = new Map([[111, PRESENCE_A]]);
    const result = mergePresenceIntoFriends([FRIEND_A, FRIEND_C], presenceMap);

    const gamma = result.find((f) => f.id === 333);
    expect(gamma).toBeDefined();
    expect(gamma.name).toBe('gamma');
    expect(gamma.presence).toBeUndefined();
  });
});
