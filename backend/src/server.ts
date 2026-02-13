import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import { envSchema } from './config/env.js';
import { initSupabase } from './config/supabase.js';
import { corsPlugin } from './plugins/cors.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/errorHandler.js';
import { healthCheckPlugin } from './plugins/healthCheck.js';
import { metricsPlugin } from './plugins/metrics.js';
import { requestLoggingPlugin } from './middleware/logging.middleware.js';
import { authRoutes } from './routes/auth.js';
import { sessionsRoutes } from './routes/sessions.js';
import { sessionsRoutesV2 } from './routes/sessions-v2.js';
import { robloxRoutes } from './routes/roblox.js';
import { meRoutes } from './routes/me.routes.js';
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

  // Initialize Supabase
  initSupabase(fastify);

  // Initialize monitoring
  monitoring.captureMessage('Server starting', 'info');

  // Register plugins
  await fastify.register(requestLoggingPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(authPlugin);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(healthCheckPlugin);
  await fastify.register(metricsPlugin);

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(sessionsRoutes);
  await fastify.register(sessionsRoutesV2);
  await fastify.register(robloxRoutes);
  await fastify.register(meRoutes, { prefix: '/api/me' });

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
