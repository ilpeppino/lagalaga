/**
 * Structured Logging with Pino
 *
 * Features:
 * - PII sanitization via custom serializers
 * - Correlation ID support for cross-layer tracing
 * - Request/response, error, metric, auth, session, and invite logging
 */

import pino from 'pino';
import { sanitize, sanitizedReqSerializer, sanitizedResSerializer } from './sanitizer.js';

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
  level: logLevel,
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: sanitizedReqSerializer,
    res: sanitizedResSerializer,
  },
});

export function createLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/**
 * Log with both requestId and correlationId for cross-layer tracing.
 */
export function logWithCorrelation(
  level: 'info' | 'warn' | 'error' | 'debug',
  data: Record<string, unknown>,
  message: string,
  requestId?: string,
  correlationId?: string
) {
  const enriched = sanitize({
    ...data,
    ...(requestId ? { requestId } : {}),
    ...(correlationId ? { correlationId } : {}),
  });
  logger[level](enriched, message);
}

export function logRequestStart(method: string, url: string, requestId: string, correlationId?: string) {
  logger.info(
    {
      requestId,
      ...(correlationId ? { correlationId } : {}),
      method,
      url,
      type: 'request_start',
    },
    `→ ${method} ${url}`
  );
}

export function logRequestEnd(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  requestId: string,
  correlationId?: string
) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  logger[level](
    {
      requestId,
      ...(correlationId ? { correlationId } : {}),
      method,
      url,
      statusCode,
      duration,
      type: 'request_end',
    },
    `← ${method} ${url} ${statusCode} (${duration}ms)`
  );
}

export function logError(
  error: Error,
  context?: Record<string, unknown>,
  message?: string
) {
  logger.error(
    sanitize({
      err: error,
      ...context,
      type: 'error',
    }),
    message || error.message
  );
}

export function logMetric(
  name: string,
  value: number,
  unit: string = 'ms',
  labels?: Record<string, string>
) {
  logger.info(
    {
      metric: name,
      value,
      unit,
      labels,
      type: 'metric',
    },
    `Metric: ${name} = ${value}${unit}`
  );
}

export function logQuery(
  query: string,
  duration: number,
  table?: string
) {
  if (logger.level === 'debug' || logger.level === 'trace') {
    logger.debug(
      {
        query,
        duration,
        table,
        type: 'db_query',
      },
      `DB Query (${duration}ms): ${table || 'unknown'}`
    );
  }
}

export function logAuthEvent(
  event: 'login' | 'logout' | 'token_refresh' | 'auth_failed',
  userId?: string,
  details?: Record<string, unknown>
) {
  logger.info(
    sanitize({
      event,
      userId,
      ...details,
      type: 'auth',
    }),
    `Auth: ${event}${userId ? ` (user: ${userId})` : ''}`
  );
}

export function logSessionEvent(
  event: 'created' | 'joined' | 'left' | 'deleted' | 'full',
  sessionId: string,
  userId?: string,
  details?: Record<string, unknown>
) {
  logger.info(
    {
      event,
      sessionId,
      userId,
      ...details,
      type: 'session',
    },
    `Session: ${event} (${sessionId})`
  );
}

export function logInviteEvent(
  event: 'created' | 'used' | 'expired',
  inviteCode: string,
  sessionId?: string,
  details?: Record<string, unknown>
) {
  logger.info(
    {
      event,
      inviteCode,
      sessionId,
      ...details,
      type: 'invite',
    },
    `Invite: ${event} (${inviteCode})`
  );
}

export default logger;
