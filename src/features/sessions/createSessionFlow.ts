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

  const filtered = input.friends
    .filter((friend) => {
      if (!query) {
        return true;
      }

      const name = friend.name.toLowerCase();
      const displayName = friend.displayName.toLowerCase();
      return name.includes(query) || displayName.includes(query);
    })
    .sort((a, b) => {
      if (!query) {
        return compareFriendsByName(a, b);
      }

      const aScore = scoreFriendMatch(a, query);
      const bScore = scoreFriendMatch(b, query);
      if (aScore !== bScore) {
        return aScore - bScore;
      }

      return compareFriendsByName(a, b);
    });

  return filtered.slice(0, limit);
}

function scoreFriendMatch(friend: RobloxFriend, query: string): number {
  const name = friend.name.toLowerCase();
  const displayName = friend.displayName.toLowerCase();

  if (displayName.startsWith(query) || name.startsWith(query)) {
    return 0;
  }

  return 1;
}

function compareFriendsByName(a: RobloxFriend, b: RobloxFriend): number {
  const aLabel = (a.displayName || a.name).toLowerCase();
  const bLabel = (b.displayName || b.name).toLowerCase();
  if (aLabel < bLabel) {
    return -1;
  }
  if (aLabel > bLabel) {
    return 1;
  }
  return a.id - b.id;
}

export function parseRobloxPlaceIdFromUrl(url: string | null | undefined): number | null {
  const raw = url?.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    const fromQuery = toPositiveInteger(parsed.searchParams.get('placeId'));
    if (fromQuery) {
      return fromQuery;
    }

    const pathMatch = parsed.pathname.match(/\/games\/(\d+)/i);
    if (pathMatch?.[1]) {
      return toPositiveInteger(pathMatch[1]);
    }
  } catch {
    return null;
  }

  return null;
}

export function getFavoritePlaceId(input: { id?: string | null; url?: string | null }): number | null {
  const fromUrl = parseRobloxPlaceIdFromUrl(input.url);
  if (fromUrl) {
    return fromUrl;
  }

  return toPositiveInteger(input.id);
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
