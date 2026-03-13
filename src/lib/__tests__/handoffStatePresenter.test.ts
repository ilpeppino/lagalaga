import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHandoffStateUi,
  getReadinessSummary,
} from '../handoffStatePresenter';

// ── getHandoffStateUi ────────────────────────────────────────────────────────

test('confirmed_in_game → success label', () => {
  const ui = getHandoffStateUi('confirmed_in_game');
  assert.equal(ui.label, 'In game');
  assert.equal(ui.severity, 'success');
  assert.equal(ui.color, '#34C759');
});

test('opened_roblox → progress label', () => {
  const ui = getHandoffStateUi('opened_roblox');
  assert.equal(ui.label, 'Opening Roblox…');
  assert.equal(ui.severity, 'progress');
});

test('rsvp_joined → ready label', () => {
  const ui = getHandoffStateUi('rsvp_joined');
  assert.equal(ui.label, 'Ready');
  assert.equal(ui.severity, 'neutral');
});

test('stuck → needs help label', () => {
  const ui = getHandoffStateUi('stuck');
  assert.equal(ui.label, 'Needs help');
  assert.equal(ui.severity, 'warning');
});

test('null handoff + joined state → Ready', () => {
  const ui = getHandoffStateUi(null, 'joined');
  assert.equal(ui.label, 'Ready');
});

test('null handoff + invited state → Invited', () => {
  const ui = getHandoffStateUi(null, 'invited');
  assert.equal(ui.label, 'Invited');
});

test('null handoff + left state → Left', () => {
  const ui = getHandoffStateUi(null, 'left');
  assert.equal(ui.label, 'Left');
});

test('null handoff + kicked state → Removed', () => {
  const ui = getHandoffStateUi(null, 'kicked');
  assert.equal(ui.label, 'Removed');
});

test('undefined handoff + undefined state → Waiting', () => {
  const ui = getHandoffStateUi(undefined, undefined);
  assert.equal(ui.label, 'Waiting');
});

test('handoff state takes priority over participant state', () => {
  // confirmed_in_game should win over participantState='joined'
  const ui = getHandoffStateUi('confirmed_in_game', 'joined');
  assert.equal(ui.label, 'In game');
});

// ── getReadinessSummary ───────────────────────────────────────────────────────

test('all in game → everyone is in game label', () => {
  const participants = [
    { state: 'joined', handoffState: 'confirmed_in_game' as const },
    { state: 'joined', handoffState: 'confirmed_in_game' as const },
  ];
  const summary = getReadinessSummary(participants);
  assert.equal(summary.inGame, 2);
  assert.equal(summary.total, 2);
  assert.equal(summary.primaryLabel, 'Everyone is in game');
});

test('partial in game → X / N in game', () => {
  const participants = [
    { state: 'joined', handoffState: 'confirmed_in_game' as const },
    { state: 'joined', handoffState: 'rsvp_joined' as const },
    { state: 'joined', handoffState: null },
  ];
  const summary = getReadinessSummary(participants);
  assert.equal(summary.inGame, 1);
  assert.equal(summary.total, 3);
  assert.match(summary.primaryLabel, /1 \/ 3 in game/);
});

test('excludes left and kicked participants', () => {
  const participants = [
    { state: 'joined', handoffState: 'confirmed_in_game' as const },
    { state: 'left', handoffState: null },
    { state: 'kicked', handoffState: null },
  ];
  const summary = getReadinessSummary(participants);
  assert.equal(summary.total, 1);
  assert.equal(summary.inGame, 1);
});

test('stuck count tracked correctly', () => {
  const participants = [
    { state: 'joined', handoffState: 'stuck' as const },
    { state: 'joined', handoffState: 'confirmed_in_game' as const },
  ];
  const summary = getReadinessSummary(participants);
  assert.equal(summary.stuck, 1);
});

test('joining players show in summary label', () => {
  const participants = [
    { state: 'joined', handoffState: 'opened_roblox' as const },
    { state: 'joined', handoffState: null },
  ];
  const summary = getReadinessSummary(participants);
  assert.equal(summary.joining, 1);
  assert.match(summary.primaryLabel, /1 joining/);
});

test('empty list returns zero counts', () => {
  const summary = getReadinessSummary([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.inGame, 0);
  assert.equal(summary.stuck, 0);
});
