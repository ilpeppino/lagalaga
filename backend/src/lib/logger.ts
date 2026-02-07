/**
 * Epic 8 Story 8.3: Structured Logging
 *
 * Provides structured logging with Pino for:
 * - Request/response logging
 * - Error tracking
 * - Performance metrics
 * - Debug information
 */

import pino from 'pino';

/**
 * Log levels:
 * - fatal (60): Application crash
 * - error (50): Error conditions
 * - warn (40): Warning conditions
 * - info (30): Informational messages
 * - debug (20): Debug messages
 * - trace (10): Trace messages
 */
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Main application logger
 */
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
    // Custom error serializer
    err: pino.stdSerializers.err,
    // Custom request serializer
    req: pino.stdSerializers.req,
    // Custom response serializer
    res: pino.stdSerializers.res,
  },
});

/**
 * Create a child logger with specific context
 *
 * @example
 * const sessionLogger = createLogger({ module: 'session-service' });
 * sessionLogger.info({ sessionId: '123' }, 'Session created');
 */
export function createLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/**
 * Log request start
 */
export function logRequestStart(method: string, url: string, requestId: string) {
  logger.info(
    {
      requestId,
      method,
      url,
      type: 'request_start',
    },
    `→ ${method} ${url}`
  );
}

/**
 * Log request completion
 */
export function logRequestEnd(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  requestId: string
) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  logger[level](
    {
      requestId,
      method,
      url,
      statusCode,
      duration,
      type: 'request_end',
    },
    `← ${method} ${url} ${statusCode} (${duration}ms)`
  );
}

/**
 * Log error with context
 */
export function logError(
  error: Error,
  context?: Record<string, unknown>,
  message?: string
) {
  logger.error(
    {
      err: error,
      ...context,
      type: 'error',
    },
    message || error.message
  );
}

/**
 * Log performance metric
 */
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

/**
 * Log database query (for debugging)
 */
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

/**
 * Log authentication event
 */
export function logAuthEvent(
  event: 'login' | 'logout' | 'token_refresh' | 'auth_failed',
  userId?: string,
  details?: Record<string, unknown>
) {
  logger.info(
    {
      event,
      userId,
      ...details,
      type: 'auth',
    },
    `Auth: ${event}${userId ? ` (user: ${userId})` : ''}`
  );
}

/**
 * Log session event
 */
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

/**
 * Log invite event
 */
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

// Export default logger
export default logger;
