import { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';

export async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET,
    sign: {
      expiresIn: fastify.config.JWT_EXPIRY,
    },
  });

  // Register refresh token JWT with different secret
  fastify.register(jwt, {
    secret: fastify.config.REFRESH_TOKEN_SECRET,
    namespace: 'refresh',
    jwtSign: 'refreshSign',
    jwtVerify: 'refreshVerify',
    sign: {
      expiresIn: fastify.config.REFRESH_TOKEN_EXPIRY,
    },
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    refreshSign: (payload: any) => string;
    refreshVerify: (token: string) => any;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      robloxUserId: string;
      robloxUsername: string;
    };
    user: {
      userId: string;
      robloxUserId: string;
      robloxUsername: string;
    };
  }
}
