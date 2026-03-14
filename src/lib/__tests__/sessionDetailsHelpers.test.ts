import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionDetail } from '../../features/sessions/types-v2';
import {
  buildSessionRoster,
  getParticipantStateBadge,
  getSessionStateChips,
  isHostParticipant,
} from '../sessionDetailsHelpers';

function makeSession(overrides?: Partial<SessionDetail>): SessionDetail {
  return {
    id: 'session-1',
    placeId: 1,
    hostId: 'host-user',
    title: 'Test session',
    visibility: 'friends',
    isRanked: false,
    status: 'active',
    maxParticipants: 8,
    currentParticipants: 3,
    game: {
      placeId: 1,
      canonicalWebUrl: 'https://www.roblox.com/games/1',
      canonicalStartUrl: 'roblox://placeID=1',
      gameName: 'Escape Tsunami for Stranger Things',
    },
    createdAt: new Date().toISOString(),
    participants: [
      {
        userId: 'member-joined',
        displayName: 'Joined Member',
        role: 'member',
        state: 'joined',
        joinedAt: new Date().toISOString(),
      },
      {
        userId: 'host-user',
        displayName: 'guardaquichice',
        role: 'host',
        state: 'joined',
        joinedAt: new Date().toISOString(),
      },
      {
        userId: 'member-invited',
        displayName: 'Purpley',
        role: 'member',
        state: 'invited',
        joinedAt: new Date().toISOString(),
      },
    ],
    invitedRobloxUsers: [
      { robloxUserId: '555', displayName: 'ilpeppazzo', appUserId: null },
      { robloxUserId: '556', displayName: 'Duplicate user', appUserId: 'member-invited' },
    ],
    ...overrides,
  };
}

test('session state chips only include LIVE', () => {
  assert.deepEqual(getSessionStateChips(true), ['LIVE']);
  assert.equal(getSessionStateChips(true).includes('FRIENDS'), false);
  assert.deepEqual(getSessionStateChips(false), []);
});

test('host is first in active players and highlighted by host variant', () => {
  const roster = buildSessionRoster(makeSession());
  assert.equal(roster.activeParticipants[0]?.userId, 'host-user');
  assert.equal(isHostParticipant(roster.activeParticipants[0], 'host-user'), true);
});

test('player rows use state badges and do not expose row-level join action labels', () => {
  const session = makeSession();
  const host = session.participants.find((participant) => participant.userId === 'host-user');
  const joined = session.participants.find((participant) => participant.userId === 'member-joined');
  const invited = session.participants.find((participant) => participant.userId === 'member-invited');

  assert.equal(getParticipantStateBadge(host!, session.hostId), 'HOST');
  assert.equal(getParticipantStateBadge(joined!, session.hostId), 'In session');
  assert.equal(getParticipantStateBadge(invited!, session.hostId), 'Invited');
  assert.equal(getParticipantStateBadge({
    ...joined!,
    state: 'left',
  }, session.hostId), null);
});

test('invited users are separated from active players', () => {
  const roster = buildSessionRoster(makeSession());
  assert.deepEqual(
    roster.activeParticipants.map((participant) => participant.userId),
    ['host-user', 'member-joined']
  );
  assert.deepEqual(
    roster.invitedEntries.map((entry) => entry.displayName),
    ['Purpley', 'ilpeppazzo']
  );
});

test('player count reflects joined users only', () => {
  const roster = buildSessionRoster(makeSession());
  assert.equal(roster.joinedCount, 2);
});
