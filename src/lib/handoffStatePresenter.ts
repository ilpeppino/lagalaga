/**
 * Handoff State Presenter
 *
 * Single source of truth for mapping backend handoff/participant states
 * to user-facing labels and visual treatment.
 *
 * Never expose raw enum values in the UI — always use this module.
 */

import type { ParticipantHandoffState } from '@/src/features/sessions/types-v2';

export type HandoffSeverity = 'success' | 'progress' | 'warning' | 'neutral';

export interface HandoffStateUi {
  /** Human-readable status label */
  label: string;
  /** Optional secondary hint shown under the label */
  sublabel?: string;
  /** Hex color for the label / dot */
  color: string;
  /** MaterialIcons name for the status icon */
  iconName: string;
  severity: HandoffSeverity;
}

/**
 * Map a participant's handoff state (and fallback participant state) to UI.
 * Call with both arguments when available — the handoff state takes priority.
 */
export function getHandoffStateUi(
  handoffState?: ParticipantHandoffState | null,
  participantState?: string | null
): HandoffStateUi {
  switch (handoffState) {
    case 'confirmed_in_game':
      return {
        label: 'In game',
        color: '#34C759',
        iconName: 'check-circle',
        severity: 'success',
      };
    case 'opened_roblox':
      return {
        label: 'Opening Roblox…',
        sublabel: 'Switching to Roblox',
        color: '#FF9500',
        iconName: 'sync',
        severity: 'progress',
      };
    case 'rsvp_joined':
      return {
        label: 'Ready',
        color: '#007AFF',
        iconName: 'check-circle-outline',
        severity: 'neutral',
      };
    case 'stuck':
      return {
        label: 'Needs help',
        sublabel: 'Having trouble joining',
        color: '#FF6B00',
        iconName: 'error-outline',
        severity: 'warning',
      };
    default:
      break;
  }

  // No handoff state — fall back to participant state
  switch (participantState) {
    case 'joined':
      return {
        label: 'Ready',
        color: '#007AFF',
        iconName: 'check-circle-outline',
        severity: 'neutral',
      };
    case 'invited':
      return {
        label: 'Invited',
        color: '#8E8E93',
        iconName: 'mail-outline',
        severity: 'neutral',
      };
    case 'left':
      return {
        label: 'Left',
        color: '#8E8E93',
        iconName: 'logout',
        severity: 'neutral',
      };
    case 'kicked':
      return {
        label: 'Removed',
        color: '#8E8E93',
        iconName: 'block',
        severity: 'neutral',
      };
    default:
      return {
        label: 'Waiting',
        color: '#8E8E93',
        iconName: 'hourglass-empty',
        severity: 'neutral',
      };
  }
}

/**
 * Summarise the readiness of a participant list.
 * Returns counts for each severity bucket.
 */
export interface ReadinessSummary {
  total: number;
  inGame: number;
  ready: number;
  joining: number;
  stuck: number;
  /** "2 / 4 in game" — primary summary line */
  primaryLabel: string;
}

export function getReadinessSummary(
  participants: Array<{
    state: string;
    handoffState?: ParticipantHandoffState | null;
  }>
): ReadinessSummary {
  const active = participants.filter(
    (p) => p.state !== 'left' && p.state !== 'kicked'
  );
  const inGame = active.filter((p) => p.handoffState === 'confirmed_in_game').length;
  const ready = active.filter(
    (p) =>
      p.handoffState === 'rsvp_joined' ||
      (p.state === 'joined' && !p.handoffState)
  ).length;
  const joining = active.filter((p) => p.handoffState === 'opened_roblox').length;
  const stuck = active.filter((p) => p.handoffState === 'stuck').length;
  const total = active.length;

  let primaryLabel: string;
  if (inGame > 0 && inGame === total) {
    primaryLabel = 'Everyone is in game';
  } else if (inGame > 0) {
    primaryLabel = `${inGame} / ${total} in game`;
  } else if (joining > 0) {
    primaryLabel = `${joining} joining…`;
  } else {
    primaryLabel = `${ready} / ${total} ready`;
  }

  return { total, inGame, ready, joining, stuck, primaryLabel };
}
