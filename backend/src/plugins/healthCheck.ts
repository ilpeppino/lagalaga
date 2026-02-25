/**
 * Health Check Plugin
 *
 * GET /health          — lightweight 200/503
 * GET /health/detailed — database ping, memory, uptime, version
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSupabase } from '../config/supabase.js';

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
}

export async function healthCheckPlugin(fastify: FastifyInstance) {
  const basicHealthHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('X-RateLimit-Excluded', 'true');
    return reply.send({
      ok: true,
      service: 'backend',
      ts: new Date().toISOString(),
    });
  };

  // Lightweight health checks (Render and common probes)
  fastify.get('/health', { config: { rateLimit: false } }, basicHealthHandler);
  fastify.get('/healthz', { config: { rateLimit: false } }, basicHealthHandler);
  fastify.get('/live', { config: { rateLimit: false } }, basicHealthHandler);
  fastify.get('/ready', { config: { rateLimit: false } }, basicHealthHandler);

  // Detailed health check
  fastify.get('/health/detailed', { config: { rateLimit: false } }, async (_request, reply) => {
    const checks: HealthCheckResult[] = [];

    // Database check
    const dbCheck = await checkDatabase();
    checks.push(dbCheck);

    // Memory check
    const memCheck = checkMemory();
    checks.push(memCheck);

    // Determine overall status
    const hasUnhealthy = checks.some((c) => c.status === 'unhealthy');
    const hasDegraded = checks.some((c) => c.status === 'degraded');
    const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

    return reply.status(statusCode).send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: fastify.config.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      checks,
    });
  });
}

const DB_CHECK_TTL_MS = 10_000;
let dbCheckCache: { result: HealthCheckResult; expiresAt: number } | null = null;

async function checkDatabase(): Promise<HealthCheckResult> {
  const now = Date.now();
  if (dbCheckCache && now < dbCheckCache.expiresAt) {
    return dbCheckCache.result;
  }

  const start = now;
  let result: HealthCheckResult;
  try {
    const supabase = getSupabase();
    // Simple query to check database connectivity
    const { error } = await supabase.from('sessions').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      result = {
        name: 'database',
        status: 'unhealthy',
        latencyMs,
        message: error.message,
      };
    } else {
      result = {
        name: 'database',
        status: latencyMs > 2000 ? 'degraded' : 'healthy',
        latencyMs,
      };
    }
  } catch (err) {
    result = {
      name: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Database check failed',
    };
  }

  dbCheckCache = { result, expiresAt: Date.now() + DB_CHECK_TTL_MS };
  return result;
}

function checkMemory(): HealthCheckResult {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const usagePercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (usagePercent > 90) status = 'unhealthy';
  else if (usagePercent > 75) status = 'degraded';

  return {
    name: 'memory',
    status,
    message: `heap: ${heapUsedMB}/${heapTotalMB}MB (${usagePercent}%), rss: ${rssMB}MB`,
  };
}
