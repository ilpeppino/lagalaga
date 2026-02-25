import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import { envSchema } from '../config/env.js';
import { getSupabase, initSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { NotificationService } from '../services/notification.service.js';

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

const LEAD_MINUTES = 10;
const WINDOW_SECONDS = 60;

async function run(): Promise<void> {
  const bootstrap = Fastify({ logger: false });

  try {
    await bootstrap.register(fastifyEnv, {
      schema: envSchema,
      dotenv: true,
    });

    initSupabase(bootstrap);
    const supabase = getSupabase();
    const notificationService = new NotificationService();

    logger.info('SessionStartingSoonJob started');

    const nowMs = Date.now();
    const windowStart = new Date(nowMs + LEAD_MINUTES * 60 * 1000).toISOString();
    const windowEnd = new Date(nowMs + LEAD_MINUTES * 60 * 1000 + WINDOW_SECONDS * 1000).toISOString();

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('id, title, scheduled_start, host_id')
      .eq('status', 'scheduled')
      .gte('scheduled_start', windowStart)
      .lt('scheduled_start', windowEnd);

    if (sessionError) {
      throw new Error(`Failed to query scheduled sessions: ${sessionError.message}`);
    }

    const sessions = (sessionData ?? []) as SessionRow[];
    if (sessions.length > 0) {
      const sessionIds = sessions.map((session) => session.id);
      const { data: participantData, error: participantError } = await supabase
        .from('session_participants')
        .select('session_id, user_id, state')
        .in('session_id', sessionIds)
        .in('state', ['invited', 'joined']);

      if (participantError) {
        throw new Error(`Failed to query session participants: ${participantError.message}`);
      }

      const participantsBySession = new Map<string, ParticipantRow[]>();
      for (const participant of (participantData ?? []) as ParticipantRow[]) {
        const existing = participantsBySession.get(participant.session_id);
        if (existing) {
          existing.push(participant);
        } else {
          participantsBySession.set(participant.session_id, [participant]);
        }
      }

      for (const session of sessions) {
        const participants = participantsBySession.get(session.id) ?? [];
        const recipients = Array.from(
          new Set(
            participants
              .filter((participant) => participant.user_id !== session.host_id)
              .map((participant) => participant.user_id)
          )
        );

        if (recipients.length === 0) {
          continue;
        }

        await notificationService.send({
          type: 'SESSION_STARTING_SOON',
          recipients,
          title: 'Starting soon',
          body: `${session.title} starts in ${LEAD_MINUTES} minutes`,
          data: {
            route: `/sessions/${session.id}`,
            sessionId: session.id,
          },
          idempotencyKey: `SESSION_STARTING_SOON:${session.id}:10m`,
        });
      }
    }

    logger.info(
      {
        sessionsMatched: sessions.length,
      },
      'SessionStartingSoonJob completed'
    );
  } finally {
    await bootstrap.close();
  }
}

run()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'SessionStartingSoonJob failed'
    );
    process.exitCode = 1;
  });
