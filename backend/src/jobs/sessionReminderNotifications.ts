import { buildServer } from '../server.js';
import { SessionReminderService } from '../services/session-reminder.service.js';

async function run() {
  const fastify = await buildServer();

  try {
    const service = new SessionReminderService(undefined, {
      leadMinutes: fastify.config.SESSION_REMINDER_LEAD_MINUTES,
      windowSeconds: fastify.config.SESSION_REMINDER_WINDOW_SECONDS,
    });

    const result = await service.processReminders();
    fastify.log.info(result, 'Manual session reminder run completed');
  } finally {
    await fastify.close();
  }
}

void run();
