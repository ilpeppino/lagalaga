import type { Session } from './types-v2';
import type { SessionSettings } from '@/src/lib/sessionSettings';

export type SessionListFilter = 'all' | 'starting_soon' | 'live';

type SessionWithOptionalTimestamps = Session & {
  updatedAt?: string;
};

function getStartTimestamp(session: Session): number {
  const startValue = session.scheduledStart ?? session.createdAt;
  const startMs = new Date(startValue).getTime();
  return Number.isFinite(startMs) ? startMs : Date.now();
}

function getCompletionTimestamp(session: SessionWithOptionalTimestamps): number {
  const completionValue = session.updatedAt ?? session.createdAt;
  const completionMs = new Date(completionValue).getTime();
  return Number.isFinite(completionMs) ? completionMs : Date.now();
}

export function isAutoCompleted(
  session: Session,
  settings: SessionSettings,
  nowMs: number = Date.now()
): boolean {
  if (session.status !== 'active') return false;
  const thresholdMs = settings.autoCompleteLiveAfterHours * 60 * 60 * 1000;
  return nowMs - getStartTimestamp(session) > thresholdMs;
}

export function isAutoHiddenCompleted(
  session: Session,
  settings: SessionSettings,
  nowMs: number = Date.now()
): boolean {
  if (session.status !== 'completed') return false;
  const thresholdMs = settings.autoHideCompletedAfterHours * 60 * 60 * 1000;
  return nowMs - getCompletionTimestamp(session) > thresholdMs;
}

export function applySessionFilter(
  sessions: Session[],
  filter: SessionListFilter,
  settings: SessionSettings,
  nowMs: number = Date.now()
): Session[] {
  return sessions.filter((session) => {
    if (isAutoHiddenCompleted(session, settings, nowMs)) {
      return false;
    }

    if (filter === 'live') {
      return session.status === 'active' && !isAutoCompleted(session, settings, nowMs);
    }

    if (filter === 'starting_soon') {
      if (session.status !== 'scheduled' || !session.scheduledStart) {
        return false;
      }

      const startTs = new Date(session.scheduledStart).getTime();
      if (!Number.isFinite(startTs)) return false;
      const maxTs = nowMs + settings.startingSoonWindowHours * 60 * 60 * 1000;
      return startTs >= nowMs && startTs <= maxTs;
    }

    if (session.status === 'active') {
      return !isAutoCompleted(session, settings, nowMs);
    }

    return session.status === 'scheduled';
  });
}

export function sortSessionsForList(a: Session, b: Session): number {
  const aIsActive = a.status === 'active';
  const bIsActive = b.status === 'active';

  if (aIsActive !== bIsActive) {
    return aIsActive ? -1 : 1;
  }

  if (a.status === 'scheduled' && b.status === 'scheduled') {
    const aStart = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER;
    const bStart = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  }

  return 0;
}
