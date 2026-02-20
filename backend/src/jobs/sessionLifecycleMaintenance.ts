import { buildServer } from '../server.js';
import { SessionLifecycleService } from '../services/session-lifecycle.service.js';

async function run() {
  const fastify = await buildServer();

  try {
    const service = new SessionLifecycleService({
      autoCompleteAfterHours: fastify.config.SESSION_AUTO_COMPLETE_AFTER_HOURS,
      completedRetentionHours: fastify.config.SESSION_COMPLETED_RETENTION_HOURS,
      batchSize: fastify.config.SESSION_LIFECYCLE_BATCH_SIZE,
    });

    const result = await service.processLifecycle();
    fastify.log.info(result, 'Manual session lifecycle maintenance completed');
  } finally {
    await fastify.close();
  }
}

void run();
