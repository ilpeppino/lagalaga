import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import { envSchema } from './config/env.js';
import { initSupabase } from './config/supabase.js';
import { corsPlugin } from './plugins/cors.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/errorHandler.js';
import { authRoutes } from './routes/auth.js';
import { sessionsRoutes } from './routes/sessions.js';
import { sessionsRoutesV2 } from './routes/sessions-v2.js';
import { robloxRoutes } from './routes/roblox.js';

async function buildServer() {
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

  // Register plugins
  await fastify.register(corsPlugin);
  await fastify.register(authPlugin);
  await fastify.register(errorHandlerPlugin);

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(sessionsRoutes);
  await fastify.register(sessionsRoutesV2); // New Epic 3 routes
  await fastify.register(robloxRoutes);

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return fastify;
}

async function start() {
  const fastify = await buildServer();

  try {
    const port = fastify.config.PORT;
    const host = fastify.config.HOST;

    await fastify.listen({ port, host });

    fastify.log.info(`🚀 Server listening on http://${host}:${port}`);
    fastify.log.info(`Environment: ${fastify.config.NODE_ENV}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
