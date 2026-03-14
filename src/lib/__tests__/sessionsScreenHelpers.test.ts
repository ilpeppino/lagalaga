import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionMetaParts, formatRelativeTime } from '../../../app/sessions/index-v2';

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------
test('formatRelativeTime: future < 60 min → "in Xm"', () => {
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  assert.equal(formatRelativeTime(future), 'in 5m');
});

test('formatRelativeTime: future 2 hours → "in 2h"', () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  assert.equal(formatRelativeTime(future), 'in 2h');
});

test('formatRelativeTime: future 3 days → "in 3d"', () => {
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatRelativeTime(future), 'in 3d');
});

test('formatRelativeTime: past < 60 min → "Xm ago"', () => {
  const past = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(formatRelativeTime(past), '10m ago');
});

test('formatRelativeTime: past 3 hours → "3h ago"', () => {
  const past = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  assert.equal(formatRelativeTime(past), '3h ago');
});

test('formatRelativeTime: past 2 days → "2d ago"', () => {
  const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatRelativeTime(past), '2d ago');
});

// ---------------------------------------------------------------------------
// buildSessionMetaParts
// ---------------------------------------------------------------------------
const baseSession = {
  visibility: 'public' as const,
  currentParticipants: 3,
  maxParticipants: 8,
  scheduledStart: null,
};

test('buildSessionMetaParts: public visibility label', () => {
  const parts = buildSessionMetaParts(baseSession, false);
  assert.equal(parts[0], 'Public');
});

test('buildSessionMetaParts: friends visibility label', () => {
  const session = { ...baseSession, visibility: 'friends' as const };
  const parts = buildSessionMetaParts(session, false);
  assert.equal(parts[0], 'Friends');
});

test('buildSessionMetaParts: invite visibility label', () => {
  const session = { ...baseSession, visibility: 'invite' as const };
  const parts = buildSessionMetaParts(session, false);
  assert.equal(parts[0], 'Invite');
});

test('buildSessionMetaParts: occupancy formatted as X/Y', () => {
  const parts = buildSessionMetaParts(baseSession, false);
  assert.equal(parts[1], '3/8');
});

test('buildSessionMetaParts: no time shown when isLive=true', () => {
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const session = { ...baseSession, scheduledStart: future };
  const parts = buildSessionMetaParts(session, true);
  assert.equal(parts.length, 2); // visibility + occupancy only
});

test('buildSessionMetaParts: no time shown when scheduledStart is null', () => {
  const parts = buildSessionMetaParts(baseSession, false);
  assert.equal(parts.length, 2);
});

test('buildSessionMetaParts: relative time appended when scheduledStart set and not live', () => {
  const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const session = { ...baseSession, scheduledStart: future };
  const parts = buildSessionMetaParts(session, false);
  assert.equal(parts.length, 3);
  assert.equal(parts[2], 'in 30m');
});
