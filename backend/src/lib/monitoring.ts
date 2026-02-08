/**
 * Backend Monitoring Service
 *
 * Singleton implementing the shared MonitoringProvider interface.
 * Ships with ConsoleMonitoringProvider (logs to Pino).
 * Swap in Sentry/DataDog by calling monitoring.setProvider(newProvider).
 */

import type { MonitoringProvider, Breadcrumb, MonitoringUser } from '../../../shared/monitoring/types.js';
import { logger } from './logger.js';

class ConsoleMonitoringProvider implements MonitoringProvider {
  captureError(error: Error, context?: Record<string, unknown>): void {
    logger.error({ err: error, ...context, type: 'monitoring_error' }, `[Monitor] ${error.message}`);
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    const pinoLevel = level === 'warning' ? 'warn' : level;
    logger[pinoLevel]({ type: 'monitoring_message' }, `[Monitor] ${message}`);
  }

  setUser(user: MonitoringUser | null): void {
    logger.debug({ userId: user?.id, type: 'monitoring_user' }, `[Monitor] User set: ${user?.id ?? 'null'}`);
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    logger.debug({ breadcrumb, type: 'monitoring_breadcrumb' }, `[Monitor] Breadcrumb: ${breadcrumb.message}`);
  }
}

class MonitoringService implements MonitoringProvider {
  private provider: MonitoringProvider;

  constructor() {
    this.provider = new ConsoleMonitoringProvider();
  }

  setProvider(provider: MonitoringProvider): void {
    this.provider = provider;
  }

  captureError(error: Error, context?: Record<string, unknown>): void {
    this.provider.captureError(error, context);
  }

  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void {
    this.provider.captureMessage(message, level);
  }

  setUser(user: MonitoringUser | null): void {
    this.provider.setUser(user);
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.provider.addBreadcrumb(breadcrumb);
  }
}

export const monitoring = new MonitoringService();
