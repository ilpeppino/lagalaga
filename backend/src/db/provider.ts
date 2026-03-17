import type { FastifyInstance } from 'fastify';
import { closePool, getPool } from './pool.js';

export type DbProvider = 'supabase' | 'postgres';

let currentProvider: DbProvider = 'supabase';

function resolveProvider(rawProvider: string): DbProvider {
  if (rawProvider === 'supabase' || rawProvider === 'postgres') {
    return rawProvider;
  }

  throw new Error(`Unsupported DB_PROVIDER value: ${rawProvider}`);
}

export function getProvider(fastify?: FastifyInstance): DbProvider {
  if (!fastify) {
    return currentProvider;
  }

  const provider = resolveProvider(fastify.config.DB_PROVIDER);
  currentProvider = provider;
  return provider;
}

function assertPostgresConfig(fastify: FastifyInstance): void {
  const requiredKeys = [
    'POSTGRES_HOST',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
  ] as const;

  for (const key of requiredKeys) {
    const value = fastify.config[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${key} must be configured when DB_PROVIDER=postgres`);
    }
  }
}

export function initDb(fastify: FastifyInstance): void {
  const provider = getProvider(fastify);

  if (provider !== 'postgres') {
    return;
  }

  assertPostgresConfig(fastify);
  getPool(fastify.config);

  fastify.addHook('onClose', async () => {
    await closePool();
  });

  fastify.log.info('Postgres pool initialized');
}
