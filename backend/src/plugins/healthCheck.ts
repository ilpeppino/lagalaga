/**
 * Health Check Plugin
 *
 * GET /health          — lightweight 200/503
 * GET /health/detailed — database ping, memory, uptime, version
 */

import { FastifyInstance } from 'fastify';
import { getSupabase } from '../config/supabase.js';

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
}

export async function healthCheckPlugin(fastify: FastifyInstance) {
  // Lightweight health check
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Detailed health check
  fastify.get('/health/detailed', async (_request, reply) => {
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

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const supabase = getSupabase();
    // Simple query to check database connectivity
    const { error } = await supabase.from('sessions').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        latencyMs,
        message: error.message,
      };
    }

    return {
      name: 'database',
      status: latencyMs > 2000 ? 'degraded' : 'healthy',
      latencyMs,
    };
  } catch (err) {
    return {
      name: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Database check failed',
    };
  }
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
