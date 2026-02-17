import type { RobloxPresencePayload } from '@/src/features/sessions/apiStore-v2';
import type { Session, SessionDetail } from '@/src/features/sessions/types-v2';

type SessionStatusInput = Pick<Session, 'status'> | Pick<SessionDetail, 'status'>;
type PresenceStatus = NonNullable<RobloxPresencePayload['statuses']>[number]['status'];
type PresenceInput = Pick<RobloxPresencePayload, 'available' | 'statuses'> | null | undefined;

export const sessionUiColors = {
  live: '#34C759',
  action: '#007AFF',
  neutral: '#6c757d',
  warning: '#FF6B00',
} as const;

export interface SessionStatusUi {
  label: string;
  color: string;
  textColor: string;
  showDot: boolean;
  isLive: boolean;
}

export interface PresenceUi {
  label: string;
  color: string;
  textColor: string;
  showDot: boolean;
  isUnavailable: boolean;
  isInGame: boolean;
  status: PresenceStatus | 'unavailable';
}

export function getSessionStatusUi(session: SessionStatusInput): SessionStatusUi {
  switch (session.status) {
    case 'active':
      return {
        label: 'LIVE',
        color: sessionUiColors.live,
        textColor: '#fff',
        showDot: true,
        isLive: true,
      };
    case 'scheduled':
      return {
        label: 'SCHEDULED',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isLive: false,
      };
    case 'completed':
      return {
        label: 'COMPLETED',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isLive: false,
      };
    case 'cancelled':
      return {
        label: 'CANCELLED',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isLive: false,
      };
    default:
      return {
        label: 'UNKNOWN',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isLive: false,
      };
  }
}

export function getSessionLiveBadge(session: SessionStatusInput): SessionStatusUi {
  return getSessionStatusUi(session);
}

export function getPresenceUi(presence: PresenceInput): PresenceUi {
  if (!presence || !presence.available) {
    return {
      label: 'Unavailable',
      color: sessionUiColors.neutral,
      textColor: '#fff',
      showDot: false,
      isUnavailable: true,
      isInGame: false,
      status: 'unavailable',
    };
  }

  const status: PresenceStatus = presence.statuses?.[0]?.status ?? 'unknown';
  switch (status) {
    case 'in_game':
      return {
        label: 'In game',
        color: sessionUiColors.live,
        textColor: '#fff',
        showDot: true,
        isUnavailable: false,
        isInGame: true,
        status,
      };
    case 'online':
      return {
        label: 'Online',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isUnavailable: false,
        isInGame: false,
        status,
      };
    case 'offline':
      return {
        label: 'Offline',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isUnavailable: false,
        isInGame: false,
        status,
      };
    case 'in_studio':
      return {
        label: 'In Studio',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isUnavailable: false,
        isInGame: false,
        status,
      };
    case 'unknown':
    default:
      return {
        label: 'Unknown',
        color: sessionUiColors.neutral,
        textColor: '#fff',
        showDot: false,
        isUnavailable: false,
        isInGame: false,
        status: 'unknown',
      };
  }
}

export function getHostPresenceLabel(presence: PresenceInput): string {
  return `Host on Roblox: ${getPresenceUi(presence).label}`;
}

export function getLiveStatusSublabel(session: SessionStatusInput, presence: PresenceInput): string | null {
  const sessionUi = getSessionStatusUi(session);
  const presenceUi = getPresenceUi(presence);

  if (sessionUi.isLive && presenceUi.status === 'offline') {
    return 'Host not in Roblox yet';
  }

  return null;
}
