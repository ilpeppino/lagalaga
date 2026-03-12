import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export const rateLimitPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '15 minutes',
    // Run after preHandlers so JWT-verified user IDs are available for authenticated routes.
    // Unauthenticated routes fall back to IP-based keying.
    hook: 'preHandler',
    keyGenerator: (request) => {
      const userId = (request as typeof request & { user?: { userId?: string } }).user?.userId;
      return userId ? `user:${userId}` : `ip:${request.ip}`;
    },
  });

  fastify.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode === 429) {
      fastify.log.warn(
        {
          ip: request.ip,
          path: request.url,
          method: request.method,
        },
        'Rate limit exceeded'
      );
    }
  });
}, { name: 'rateLimitPlugin' });
