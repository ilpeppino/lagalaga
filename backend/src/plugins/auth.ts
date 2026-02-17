import { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';

// Wrap with fastify-plugin so JWT decorators are visible to sibling plugins/routes.
export const authPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET,
    sign: {
      expiresIn: fastify.config.JWT_EXPIRY,
    },
  });

  // Register refresh token JWT with different secret
  await fastify.register(jwt, {
    secret: fastify.config.REFRESH_TOKEN_SECRET,
    namespace: 'refresh',
    sign: {
      expiresIn: fastify.config.REFRESH_TOKEN_EXPIRY,
    },
  });
}, { name: 'authPlugin' });

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      robloxUserId: string;
      robloxUsername: string;
      tokenVersion: number;
    };
    user: {
      userId: string;
      robloxUserId: string;
      robloxUsername: string;
      tokenVersion: number;
    };
  }
}
