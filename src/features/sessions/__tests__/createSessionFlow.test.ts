import {
  buildAutoSessionTitle,
  buildAvailableFriends,
  buildFriendSearchResults,
  buildScheduledStartIso,
  buildSelectedFriendsMap,
  combineDateAndTime,
} from '../createSessionFlow';

describe('createSessionFlow helpers', () => {
  const friends = [
    { id: 1, name: 'alpha', displayName: 'Alpha', avatarUrl: null },
    { id: 2, name: 'bravo', displayName: 'Bravo', avatarUrl: null },
    { id: 3, name: 'charlie', displayName: 'Charlie', avatarUrl: null },
  ];

  it('buildAutoSessionTitle prefers display name and game name', () => {
    expect(
      buildAutoSessionTitle({ robloxDisplayName: 'Laga', robloxUsername: 'laga_user', gameName: 'Arsenal' })
    ).toBe("Laga's Arsenal session");
  });

  it('buildAutoSessionTitle falls back to username', () => {
    expect(
      buildAutoSessionTitle({ robloxUsername: 'laga_user', gameName: 'Arsenal' })
    ).toBe("laga_user's Arsenal session");
  });

  it('buildAutoSessionTitle falls back safely', () => {
    expect(buildAutoSessionTitle({})).toBe('Your Roblox session');
  });

  it('combineDateAndTime merges local date + local time', () => {
    const date = new Date(2026, 2, 20, 8, 0, 0, 0);
    const time = new Date(2026, 2, 14, 19, 45, 0, 0);

    const combined = combineDateAndTime(date, time);
    expect(combined.getFullYear()).toBe(2026);
    expect(combined.getMonth()).toBe(2);
    expect(combined.getDate()).toBe(20);
    expect(combined.getHours()).toBe(19);
    expect(combined.getMinutes()).toBe(45);
  });

  it('buildScheduledStartIso returns undefined for now mode', () => {
    const iso = buildScheduledStartIso({
      startMode: 'now',
      scheduledDate: new Date(2026, 2, 20),
      scheduledTime: new Date(2026, 2, 20, 10, 30),
    });

    expect(iso).toBeUndefined();
  });

  it('buildScheduledStartIso returns ISO for scheduled mode', () => {
    const iso = buildScheduledStartIso({
      startMode: 'scheduled',
      scheduledDate: new Date(2026, 2, 20),
      scheduledTime: new Date(2026, 2, 20, 14, 30),
    });

    expect(typeof iso).toBe('string');
    const parsed = new Date(iso!);
    expect(parsed.getDate()).toBe(20);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
  });

  it('buildSelectedFriendsMap keeps selected ID order', () => {
    const selected = buildSelectedFriendsMap(friends, [3, 1]);
    expect(selected.map((friend) => friend.id)).toEqual([3, 1]);
  });

  it('buildSelectedFriendsMap ignores IDs not in friend list', () => {
    const selected = buildSelectedFriendsMap(friends, [99, 2]);
    expect(selected.map((friend) => friend.id)).toEqual([2]);
  });

  it('buildAvailableFriends excludes selected and applies search', () => {
    const available = buildAvailableFriends({
      friends,
      selectedIds: [1],
      searchQuery: 'ha',
    });

    expect(available.map((friend) => friend.id)).toEqual([3]);
  });

  it('buildFriendSearchResults returns all when query empty and applies limit', () => {
    const results = buildFriendSearchResults({
      friends,
      searchQuery: '',
      limit: 2,
    });

    expect(results.map((friend) => friend.id)).toEqual([1, 2]);
  });

  it('buildFriendSearchResults filters by display name or username', () => {
    const results = buildFriendSearchResults({
      friends,
      searchQuery: 'brav',
    });

    expect(results.map((friend) => friend.id)).toEqual([2]);
  });
});
