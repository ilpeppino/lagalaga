/**
 * Epic 8 Story 8.3: Request Logging Middleware
 *
 * Logs all HTTP requests and responses with:
 * - Request ID for tracing
 * - Method, URL, status code
 * - Response time
 * - Error details
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { logRequestStart, logRequestEnd, logError } from '../lib/logger.js';

/**
 * Request logging plugin for Fastify
 */
export async function requestLoggingPlugin(fastify: FastifyInstance) {
  // Add request ID to all requests
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.id = crypto.randomUUID();
  });

  // Log request start
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    logRequestStart(request.method, request.url, request.id);
  });

  // Log request end
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = reply.getResponseTime();
    logRequestEnd(request.method, request.url, reply.statusCode, duration, request.id);
  });

  // Log errors
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    logError(
      error,
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      },
      `Request error: ${request.method} ${request.url}`
    );
  });
}

/**
 * Helper to add custom request context for logging
 */
export function addRequestContext(
  request: FastifyRequest,
  context: Record<string, unknown>
) {
  // Store context on request for use in logs
  (request as any).logContext = {
    ...(request as any).logContext,
    ...context,
  };
}

/**
 * Get request context for logging
 */
export function getRequestContext(request: FastifyRequest): Record<string, unknown> {
  return (request as any).logContext || {};
}
