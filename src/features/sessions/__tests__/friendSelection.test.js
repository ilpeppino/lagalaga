/* global describe, it, expect */
import { buildCreateSessionPayload, buildTwoRowColumns, toggleFriendSelection } from '../friendSelection';

describe('friendSelection helpers', () => {
  it('toggleFriendSelection adds and removes IDs', () => {
    expect(toggleFriendSelection([], 10)).toEqual([10]);
    expect(toggleFriendSelection([10, 11], 11)).toEqual([10]);
  });

  it('buildTwoRowColumns keeps two visible rows per column', () => {
    const friends = [
      { id: 1, name: 'a', displayName: 'A', avatarUrl: null },
      { id: 2, name: 'b', displayName: 'B', avatarUrl: null },
      { id: 3, name: 'c', displayName: 'C', avatarUrl: null },
    ];

    const columns = buildTwoRowColumns(friends);
    expect(columns).toHaveLength(2);
    expect(columns[0]).toHaveLength(2);
    expect(columns[1]).toHaveLength(1);
  });

  it('buildCreateSessionPayload includes invitedRobloxUserIds', () => {
    const payload = buildCreateSessionPayload({
      robloxUrl: 'https://www.roblox.com/games/123',
      title: 'Night Session',
      visibility: 'friends',
      selectedFriendIds: [55, 66, 55],
    });

    expect(payload.invitedRobloxUserIds).toEqual([55, 66]);
  });
});
