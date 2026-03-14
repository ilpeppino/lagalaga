import type { RobloxFriend } from './types-v2';

export type SessionStartMode = 'now' | 'scheduled';

export function buildAutoSessionTitle(input: {
  robloxDisplayName?: string | null;
  robloxUsername?: string | null;
  gameName?: string | null;
}): string {
  const rawName = input.robloxDisplayName?.trim() || input.robloxUsername?.trim() || 'Your';
  const gameName = input.gameName?.trim() || 'Roblox';
  if (rawName === 'Your') {
    return `Your ${gameName} session`;
  }
  return `${rawName}'s ${gameName} session`;
}

export function combineDateAndTime(datePart: Date, timePart: Date): Date {
  return new Date(
    datePart.getFullYear(),
    datePart.getMonth(),
    datePart.getDate(),
    timePart.getHours(),
    timePart.getMinutes(),
    0,
    0
  );
}

export function buildScheduledStartIso(input: {
  startMode: SessionStartMode;
  scheduledDate: Date;
  scheduledTime: Date;
}): string | undefined {
  if (input.startMode !== 'scheduled') {
    return undefined;
  }

  return combineDateAndTime(input.scheduledDate, input.scheduledTime).toISOString();
}

export function buildSelectedFriendsMap(friends: RobloxFriend[], selectedIds: number[]): RobloxFriend[] {
  const byId = new Map(friends.map((friend) => [friend.id, friend]));
  return selectedIds.map((id) => byId.get(id)).filter((friend): friend is RobloxFriend => Boolean(friend));
}

export function buildAvailableFriends(input: {
  friends: RobloxFriend[];
  selectedIds: number[];
  searchQuery: string;
}): RobloxFriend[] {
  const selectedSet = new Set(input.selectedIds);
  const query = input.searchQuery.trim().toLowerCase();

  return input.friends.filter((friend) => {
    if (selectedSet.has(friend.id)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const name = friend.name.toLowerCase();
    const displayName = friend.displayName.toLowerCase();
    return name.includes(query) || displayName.includes(query);
  });
}

export function buildFriendSearchResults(input: {
  friends: RobloxFriend[];
  searchQuery: string;
  limit?: number;
}): RobloxFriend[] {
  const query = input.searchQuery.trim().toLowerCase();
  const limit = input.limit ?? 24;

  const filtered = input.friends.filter((friend) => {
    if (!query) {
      return true;
    }

    const name = friend.name.toLowerCase();
    const displayName = friend.displayName.toLowerCase();
    return name.includes(query) || displayName.includes(query);
  });

  return filtered.slice(0, limit);
}
