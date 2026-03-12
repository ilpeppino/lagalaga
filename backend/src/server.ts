import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import { envSchema, validateEnvForRuntime } from './config/env.js';
import { initSupabase } from './config/supabase.js';
import { corsPlugin } from './plugins/cors.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/errorHandler.js';
import { healthCheckPlugin } from './plugins/healthCheck.js';
import { metricsPlugin } from './plugins/metrics.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { requestLoggingPlugin } from './middleware/logging.middleware.js';
import { authRoutes } from './routes/auth.js';
import { robloxConnectRoutes } from './routes/roblox-connect.routes.js';
import { sessionsRoutes } from './routes/sessions.js';
import { sessionsRoutesV2 } from './routes/sessions-v2.js';
import { robloxRoutes } from './routes/roblox.js';
import { meRoutes } from './routes/me.routes.js';
import { presenceRoutes } from './routes/presence.routes.js';
import { friendsRoutes } from './routes/friends.routes.js';
import { leaderboardRoutes } from './routes/leaderboard.routes.js';
import { accountRoutes } from './routes/account.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { safetyEscalationWebhookRoutes } from './routes/safety-escalation-webhook.routes.js';
import { isCompetitiveDepthEnabled } from './config/featureFlags.js';
import { SeasonService } from './services/seasonService.js';
import { AccountDeletionService } from './services/account-deletion.service.js';
import { SessionLifecycleService } from './services/session-lifecycle.service.js';
import { CacheCleanupService } from './services/cache-cleanup.service.js';
import { monitoring } from './lib/monitoring.js';
import { fileURLToPath } from 'node:url';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register environment plugin
  await fastify.register(fastifyEnv, {
    schema: envSchema,
    dotenv: true,
  });
  validateEnvForRuntime(fastify.config);

  // Initialize Supabase
  initSupabase(fastify);

  // Initialize monitoring
  monitoring.captureMessage('Server starting', 'info');

  // Register plugins
  await fastify.register(requestLoggingPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(authPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(healthCheckPlugin);
  await fastify.register(metricsPlugin);

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(robloxConnectRoutes, { prefix: '/api/auth' });
  await fastify.register(sessionsRoutes);
  await fastify.register(sessionsRoutesV2);
  await fastify.register(robloxRoutes);
  await fastify.register(meRoutes, { prefix: '/api/me' });
  await fastify.register(presenceRoutes);
  await fastify.register(friendsRoutes);
  await fastify.register(leaderboardRoutes);
  await fastify.register(accountRoutes, { prefix: '/v1/account' });
  await fastify.register(reportsRoutes);
  await fastify.register(safetyEscalationWebhookRoutes);

  if (isCompetitiveDepthEnabled(fastify)) {
    const seasonService = new SeasonService();
    const intervalMs = 60 * 60 * 1000;
    const timer = setInterval(() => {
      void seasonService.processRolloverIfNeeded();
    }, intervalMs);

    void seasonService.processRolloverIfNeeded();

    fastify.addHook('onClose', async () => {
      clearInterval(timer);
    });
  }

  if (fastify.config.ACCOUNT_PURGE_ENABLED && fastify.config.NODE_ENV !== 'test') {
    const accountDeletionService = new AccountDeletionService({
      gracePeriodDays: fastify.config.ACCOUNT_DELETION_GRACE_DAYS,
    });
    const intervalMs = Math.max(1, fastify.config.ACCOUNT_PURGE_INTERVAL_MINUTES) * 60 * 1000;

    const PURGE_VOLUME_ALERT_THRESHOLD = 10;
    let purgeRunning = false;

    const runPurge = async () => {
      if (purgeRunning) {
        fastify.log.warn('Account deletion purge skipped — previous run still in progress');
        return;
      }
      purgeRunning = true;
      try {
        const result = await accountDeletionService.processDueDeletionRequests();
        if (result.processed > 0 || result.failed > 0) {
          fastify.log.info(
            { processed: result.processed, failed: result.failed },
            'Account deletion purge cycle finished'
          );
        }
        if (result.processed >= PURGE_VOLUME_ALERT_THRESHOLD) {
          fastify.log.warn(
            { processed: result.processed, threshold: PURGE_VOLUME_ALERT_THRESHOLD },
            'High account deletion volume detected — possible coordinated attack'
          );
        }
      } catch (error) {
        fastify.log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Account deletion purge cycle failed'
        );
      } finally {
        purgeRunning = false;
      }
    };

    const purgeTimer = setInterval(() => {
      void runPurge();
    }, intervalMs);
    void runPurge();

    fastify.addHook('onClose', async () => {
      clearInterval(purgeTimer);
    });
  }

  if (fastify.config.SESSION_LIFECYCLE_ENABLED && fastify.config.NODE_ENV !== 'test') {
    const lifecycleService = new SessionLifecycleService({
      autoCompleteAfterHours: fastify.config.SESSION_AUTO_COMPLETE_AFTER_HOURS,
      completedRetentionHours: fastify.config.SESSION_COMPLETED_RETENTION_HOURS,
      batchSize: fastify.config.SESSION_LIFECYCLE_BATCH_SIZE,
    });
    const intervalMs = Math.max(1, fastify.config.SESSION_LIFECYCLE_INTERVAL_MINUTES) * 60 * 1000;

    const runLifecycle = async () => {
      try {
        const result = await lifecycleService.processLifecycle();
        if (result.autoCompletedCount > 0 || result.archivedCompletedCount > 0) {
          fastify.log.info(
            {
              autoCompletedCount: result.autoCompletedCount,
              archivedCompletedCount: result.archivedCompletedCount,
            },
            'Session lifecycle cycle finished'
          );
        }
      } catch (error) {
        fastify.log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Session lifecycle cycle failed'
        );
      }
    };

    const lifecycleTimer = setInterval(() => {
      void runLifecycle();
    }, intervalMs);
    void runLifecycle();

    fastify.addHook('onClose', async () => {
      clearInterval(lifecycleTimer);
    });
  }

  if (fastify.config.CACHE_CLEANUP_ENABLED && fastify.config.NODE_ENV !== 'test') {
    const cacheCleanupService = new CacheCleanupService();
    const intervalMs = Math.max(1, fastify.config.CACHE_CLEANUP_INTERVAL_HOURS) * 60 * 60 * 1000;

    const runCacheCleanup = async () => {
      try {
        const result = await cacheCleanupService.processCleanup();
        if (
          result.deletedExperienceCacheCount > 0 ||
          result.deletedFriendsCacheCount > 0 ||
          result.deletedFavoritesCacheCount > 0 ||
          result.deletedGamesCount > 0
        ) {
          fastify.log.info(result, 'Cache cleanup cycle finished');
        }
      } catch (error) {
        fastify.log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Cache cleanup cycle failed'
        );
      }
    };

    const cacheCleanupTimer = setInterval(() => {
      void runCacheCleanup();
    }, intervalMs);
    void runCacheCleanup();

    fastify.addHook('onClose', async () => {
      clearInterval(cacheCleanupTimer);
    });
  }

  return fastify;
}

async function start() {
  const fastify = await buildServer();

  try {
    const port = fastify.config.PORT;
    const host = fastify.config.HOST;

    await fastify.listen({ port, host });

    fastify.log.info(`Server listening on http://${host}:${port}`);
    fastify.log.info(`Environment: ${fastify.config.NODE_ENV}`);
    monitoring.captureMessage('Server started successfully', 'info');
  } catch (err) {
    fastify.log.error(err);
    monitoring.captureError(err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  }
}

const modulePath = fileURLToPath(import.meta.url);
const isEntrypoint = process.argv[1] === modulePath;

if (isEntrypoint) {
  void start();
}
