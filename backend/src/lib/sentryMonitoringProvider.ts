import * as Sentry from '@sentry/node';
import type { Breadcrumb, MonitoringProvider, MonitoringUser } from '../types/monitoring.js';
import { sanitize } from './sanitizer.js';

export class SentryMonitoringProvider implements MonitoringProvider {
  captureError(error: Error, context?: Record<string, unknown>): void {
    Sentry.captureException(error, {
      extra: sanitize(context ?? {}),
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
      data: sanitize((breadcrumb.data ?? {}) as Record<string, unknown>),
    });
  }
}

let initialized = false;

export function initializeBackendSentry(dsn: string, environment: string): void {
  if (initialized) {
    return;
  }

  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
  });

  initialized = true;
}
