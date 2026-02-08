/**
 * Frontend Monitoring Service
 *
 * Implements shared MonitoringProvider interface.
 * Ships with ConsoleMonitoringProvider (logs via Logger).
 * Swap in Sentry by calling monitoring.setProvider(sentryAdapter).
 */

import type { MonitoringProvider, Breadcrumb, MonitoringUser } from '../../shared/monitoring/types';
import { logger } from './logger';

class ConsoleMonitoringProvider implements MonitoringProvider {
  captureError(error: Error, context?: Record<string, unknown>): void {
    logger.error(`[Monitor] ${error.message}`, { error: error.message, stack: error.stack, ...context });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    const logLevel = level === 'warning' ? 'warn' : level;
    logger[logLevel](`[Monitor] ${message}`);
  }

  setUser(user: MonitoringUser | null): void {
    logger.debug(`[Monitor] User set: ${user?.id ?? 'null'}`);
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    logger.debug(`[Monitor] Breadcrumb: ${breadcrumb.message}`, { breadcrumb });
  }
}

class MonitoringService implements MonitoringProvider {
  private provider: MonitoringProvider;
  private breadcrumbs: Breadcrumb[] = [];
  private currentUser: MonitoringUser | null = null;

  constructor() {
    this.provider = new ConsoleMonitoringProvider();
  }

  setProvider(provider: MonitoringProvider): void {
    this.provider = provider;
  }

  captureError(error: Error, context?: Record<string, unknown>): void {
    this.provider.captureError(error, {
      ...context,
      recentBreadcrumbs: this.breadcrumbs.slice(-10),
      userId: this.currentUser?.id,
    });
  }

  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void {
    this.provider.captureMessage(message, level);
  }

  setUser(user: MonitoringUser | null): void {
    this.currentUser = user;
    this.provider.setUser(user);
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    const enriched: Breadcrumb = {
      ...breadcrumb,
      timestamp: breadcrumb.timestamp ?? Date.now(),
    };

    this.breadcrumbs.push(enriched);
    // Keep last 50 breadcrumbs
    if (this.breadcrumbs.length > 50) {
      this.breadcrumbs = this.breadcrumbs.slice(-50);
    }

    this.provider.addBreadcrumb(enriched);
  }

  /** Track navigation events. */
  trackNavigation(screen: string): void {
    this.addBreadcrumb({
      category: 'navigation',
      message: `Navigated to ${screen}`,
      level: 'info',
      data: { screen },
    });
  }

  /** Track HTTP requests. */
  trackHttpRequest(method: string, url: string, statusCode?: number): void {
    this.addBreadcrumb({
      category: 'http',
      message: `${method} ${url}${statusCode ? ` → ${statusCode}` : ''}`,
      level: statusCode && statusCode >= 400 ? 'warning' : 'info',
      data: { method, url, statusCode },
    });
  }
}

export const monitoring = new MonitoringService();
