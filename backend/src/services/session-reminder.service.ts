import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { NotificationService } from './notification.service.js';

interface SessionReminderServiceOptions {
  leadMinutes?: number;
  windowSeconds?: number;
  batchSize?: number;
}

interface SessionRow {
  id: string;
  title: string;
  scheduled_start: string | null;
  host_id: string;
}

interface ParticipantRow {
  session_id: string;
  user_id: string;
  state: 'invited' | 'joined' | 'left' | 'kicked';
}

export interface SessionReminderRunResult {
  checkedAt: string;
  sessionsMatched: number;
  notificationsQueued: number;
}

const DEFAULT_LEAD_MINUTES = 10;
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_BATCH_SIZE = 500;

export class SessionReminderService {
  private readonly leadMinutes: number;
  private readonly windowSeconds: number;
  private readonly batchSize: number;

  constructor(
    private readonly notificationService: NotificationService = new NotificationService(),
    options: SessionReminderServiceOptions = {}
  ) {
    this.leadMinutes = Math.max(1, Math.round(options.leadMinutes ?? DEFAULT_LEAD_MINUTES));
    this.windowSeconds = Math.max(1, Math.round(options.windowSeconds ?? DEFAULT_WINDOW_SECONDS));
    this.batchSize = Math.max(1, Math.round(options.batchSize ?? DEFAULT_BATCH_SIZE));
  }

  async processReminders(now: Date = new Date()): Promise<SessionReminderRunResult> {
    const nowMs = now.getTime();
    const windowStart = new Date(nowMs + this.leadMinutes * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + this.windowSeconds * 1000);

    const sessions = await this.findScheduledSessions(windowStart.toISOString(), windowEnd.toISOString());

    if (sessions.length === 0) {
      return {
        checkedAt: now.toISOString(),
        sessionsMatched: 0,
        notificationsQueued: 0,
      };
    }

    const participantsBySession = await this.findSessionParticipants(sessions.map((session) => session.id));
    let notificationsQueued = 0;

    for (const session of sessions) {
      const participants = participantsBySession.get(session.id) ?? [];
      const recipientIds = Array.from(
        new Set(
          participants
            .filter((participant) => participant.user_id !== session.host_id)
            .map((participant) => participant.user_id)
        )
      );

      if (recipientIds.length === 0) {
        continue;
      }

      notificationsQueued += recipientIds.length;

      await this.notificationService.send({
        type: 'SESSION_STARTING_SOON',
        recipients: recipientIds,
        title: 'Starting soon',
        body: `${session.title} starts in ${this.leadMinutes} minutes`,
        data: {
          route: `/sessions/${session.id}`,
          sessionId: session.id,
        },
        idempotencyKey: `SESSION_STARTING_SOON:${session.id}:${this.leadMinutes}m`,
      });
    }

    logger.info(
      {
        sessionsMatched: sessions.length,
        notificationsQueued,
        leadMinutes: this.leadMinutes,
        windowSeconds: this.windowSeconds,
      },
      'session_reminders: processed window'
    );

    return {
      checkedAt: now.toISOString(),
      sessionsMatched: sessions.length,
      notificationsQueued,
    };
  }

  private async findScheduledSessions(windowStartIso: string, windowEndIso: string): Promise<SessionRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sessions')
      .select('id, title, scheduled_start, host_id')
      .eq('status', 'scheduled')
      .gte('scheduled_start', windowStartIso)
      .lt('scheduled_start', windowEndIso)
      .limit(this.batchSize);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to query reminder sessions: ${error.message}`);
    }

    return (data ?? []) as SessionRow[];
  }

  private async findSessionParticipants(sessionIds: string[]): Promise<Map<string, ParticipantRow[]>> {
    const map = new Map<string, ParticipantRow[]>();
    if (sessionIds.length === 0) {
      return map;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('session_participants')
      .select('session_id, user_id, state')
      .in('session_id', sessionIds)
      .in('state', ['invited', 'joined']);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to query reminder participants: ${error.message}`);
    }

    for (const row of (data ?? []) as ParticipantRow[]) {
      const bucket = map.get(row.session_id);
      if (bucket) {
        bucket.push(row);
      } else {
        map.set(row.session_id, [row]);
      }
    }

    return map;
  }
}
