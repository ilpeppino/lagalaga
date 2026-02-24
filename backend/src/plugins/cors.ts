import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

export async function corsPlugin(fastify: FastifyInstance) {
  const configuredOrigins = fastify.config.CORS_ORIGIN
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const hasWildcardOrigin = configuredOrigins.includes('*');
  const isProduction = fastify.config.NODE_ENV === 'production';

  if (isProduction && (hasWildcardOrigin || configuredOrigins.length === 0)) {
    throw new Error(
      'Invalid CORS_ORIGIN for production. Set one or more explicit origins (comma-separated), never "*".'
    );
  }

  const originConfig =
    configuredOrigins.length === 0
      ? true
      : hasWildcardOrigin
        ? true
        : configuredOrigins.length === 1
          ? configuredOrigins[0]
          : configuredOrigins;

  await fastify.register(cors, {
    origin: originConfig,
    credentials: true,
  });
}
