import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, MonitoringProvider, MonitoringUser } from '../../shared/monitoring/types';

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|session|api[_-]?key)/i;

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[Circular]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  const obj = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    sanitized[key] = sanitizeValue(entry, seen);
  }

  return sanitized;
}

export class SentryMonitoringProvider implements MonitoringProvider {
  captureError(error: Error, context?: Record<string, unknown>): void {
    Sentry.captureException(error, {
      extra: sanitizeValue(context) as Record<string, unknown> | undefined,
    });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    Sentry.captureMessage(message, level);
  }

  setUser(user: MonitoringUser | null): void {
    Sentry.setUser(user ? { id: user.id, username: user.username } : null);
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    Sentry.addBreadcrumb({
      category: breadcrumb.category,
      message: breadcrumb.message,
      level:
        breadcrumb.level === 'warning'
          ? 'warning'
          : breadcrumb.level === 'error'
            ? 'error'
            : 'info',
      timestamp: breadcrumb.timestamp ? breadcrumb.timestamp / 1000 : undefined,
      data: sanitizeValue(breadcrumb.data) as Record<string, unknown> | undefined,
    });
  }
}

let initialized = false;

export function initializeSentry(dsn: string): void {
  if (initialized) {
    return;
  }

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    enableLogs: false,
  });

  initialized = true;
}
