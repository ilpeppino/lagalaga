import type { CreateSessionInput, RobloxFriend, SessionVisibility } from './types-v2';

export function toggleFriendSelection(selectedIds: number[], friendId: number): number[] {
  if (selectedIds.includes(friendId)) {
    return selectedIds.filter((id) => id !== friendId);
  }
  return [...selectedIds, friendId];
}

export function buildTwoRowColumns(friends: RobloxFriend[]): RobloxFriend[][] {
  const columns: RobloxFriend[][] = [];
  for (let index = 0; index < friends.length; index += 2) {
    columns.push(friends.slice(index, index + 2));
  }
  return columns;
}

export function buildCreateSessionPayload(input: {
  robloxUrl: string;
  title: string;
  visibility: SessionVisibility;
  scheduledStart?: string;
  selectedFriendIds: number[];
}): CreateSessionInput {
  return {
    robloxUrl: input.robloxUrl,
    title: input.title,
    visibility: input.visibility,
    scheduledStart: input.scheduledStart,
    invitedRobloxUserIds: [...new Set(input.selectedFriendIds.filter((id) => Number.isInteger(id) && id > 0))],
  };
}
