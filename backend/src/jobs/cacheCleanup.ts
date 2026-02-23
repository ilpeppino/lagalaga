import { buildServer } from '../server.js';
import { CacheCleanupService } from '../services/cache-cleanup.service.js';

async function run() {
  const fastify = await buildServer();

  try {
    const service = new CacheCleanupService();
    const result = await service.processCleanup();
    fastify.log.info(result, 'Manual cache cleanup completed');
  } finally {
    await fastify.close();
  }
}

void run();
