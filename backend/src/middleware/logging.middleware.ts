/**
 * Request Logging Middleware
 *
 * Features:
 * - Request ID generation
 * - Correlation ID from X-Correlation-ID header (client-supplied)
 * - X-Request-ID response header for cross-layer tracing
 * - Request/response/error logging
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { logRequestStart, logRequestEnd, logError } from '../lib/logger.js';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId?: string;
  }
}

export async function requestLoggingPlugin(fastify: FastifyInstance) {
  // Assign request ID and capture correlation ID
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    request.id = crypto.randomUUID();
    request.correlationId = (request.headers['x-correlation-id'] as string) || undefined;

    // Send request ID back so the client can correlate
    reply.header('X-Request-ID', request.id);
  });

  // Log request start
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    logRequestStart(request.method, request.url, request.id, request.correlationId);
  });

  // Log request end
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = (reply as any).getResponseTime?.() ?? 0;
    logRequestEnd(request.method, request.url, reply.statusCode, duration, request.id, request.correlationId);
  });

  // Log errors
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    logError(
      error,
      {
        requestId: request.id,
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      },
      `Request error: ${request.method} ${request.url}`
    );
  });
}

export function addRequestContext(
  request: FastifyRequest,
  context: Record<string, unknown>
) {
  const req = request as unknown as Record<string, unknown>;
  req.logContext = {
    ...(req.logContext as Record<string, unknown> || {}),
    ...context,
  };
}

export function getRequestContext(request: FastifyRequest): Record<string, unknown> {
  return (request as unknown as Record<string, unknown>).logContext as Record<string, unknown> || {};
}
