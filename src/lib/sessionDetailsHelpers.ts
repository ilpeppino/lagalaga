import type { SessionDetail, SessionParticipant } from '../features/sessions/types-v2';

export interface SessionInvitedEntry {
  key: string;
  displayName: string;
  initials: string;
  source: 'participant' | 'roblox';
}

export interface SessionRoster {
  activeParticipants: SessionParticipant[];
  invitedEntries: SessionInvitedEntry[];
  joinedCount: number;
}

export function getDisplayName(value?: string | null, fallback = 'Player'): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function getInitials(name?: string | null): string {
  const display = getDisplayName(name, '?');
  const initials = display
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || display.substring(0, 2).toUpperCase();
}

export function getSessionStateChips(isLive: boolean): string[] {
  return isLive ? ['LIVE'] : [];
}

export function getParticipantStateBadge(
  participant: SessionParticipant,
  hostId: string
): 'HOST' | 'In session' | 'Invited' | null {
  if (participant.userId === hostId) return 'HOST';
  if (participant.state === 'joined') return 'In session';
  if (participant.state === 'invited') return 'Invited';
  return null;
}

export function isHostParticipant(participant: SessionParticipant, hostId: string): boolean {
  return participant.userId === hostId;
}

export function buildSessionRoster(
  session: Pick<SessionDetail, 'hostId' | 'participants' | 'invitedRobloxUsers'>
): SessionRoster {
  const participantUserIds = new Set(session.participants.map((participant) => participant.userId));
  const joinedCount = session.participants.filter((participant) => participant.state === 'joined').length;

  const hostParticipant = session.participants.find((participant) => participant.userId === session.hostId);
  const joinedNonHostParticipants = session.participants.filter(
    (participant) => participant.userId !== session.hostId && participant.state === 'joined'
  );
  const activeParticipants = hostParticipant
    ? [hostParticipant, ...joinedNonHostParticipants]
    : joinedNonHostParticipants;

  const invitedParticipants = session.participants
    .filter((participant) => participant.userId !== session.hostId && participant.state === 'invited')
    .map((participant) => ({
      key: `participant-${participant.userId}`,
      displayName: getDisplayName(participant.displayName, participant.userId),
      initials: getInitials(participant.displayName ?? participant.userId),
      source: 'participant' as const,
    }));

  const unresolvedInvitedRobloxUsers = (session.invitedRobloxUsers ?? [])
    .filter((invitedUser) => !invitedUser.appUserId || !participantUserIds.has(invitedUser.appUserId))
    .map((invitedUser) => ({
      key: `roblox-${invitedUser.robloxUserId}`,
      displayName: getDisplayName(invitedUser.displayName, 'Invited player'),
      initials: getInitials(invitedUser.displayName ?? 'Invited player'),
      source: 'roblox' as const,
    }));

  return {
    activeParticipants,
    invitedEntries: [...invitedParticipants, ...unresolvedInvitedRobloxUsers],
    joinedCount,
  };
}
