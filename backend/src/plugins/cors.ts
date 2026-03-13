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

  const isWildcard = configuredOrigins.length === 0 || hasWildcardOrigin;

  const originConfig = isWildcard
    ? true
    : configuredOrigins.length === 1
      ? configuredOrigins[0]
      : configuredOrigins;

  await fastify.register(cors, {
    origin: originConfig,
    // Never combine credentials:true with a wildcard origin — browsers reject it
    // and it would allow cross-site credential-bearing requests from any domain.
    credentials: !isWildcard,
  });
}
