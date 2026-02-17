import { buildServer } from '../server.js';
import { AccountDeletionService } from '../services/account-deletion.service.js';

async function run() {
  const fastify = await buildServer();

  try {
    const service = new AccountDeletionService({
      gracePeriodDays: fastify.config.ACCOUNT_DELETION_GRACE_DAYS,
    });

    const result = await service.processDueDeletionRequests(100);
    fastify.log.info(result, 'Manual account deletion purge completed');
  } finally {
    await fastify.close();
  }
}

void run();
