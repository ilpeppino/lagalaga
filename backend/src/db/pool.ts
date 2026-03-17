import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(env?: FastifyInstance['config']): Pool {
  if (pool) {
    return pool;
  }

  if (!env) {
    throw new Error('Postgres pool not initialized');
  }

  pool = new Pool({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...(env.POSTGRES_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}
