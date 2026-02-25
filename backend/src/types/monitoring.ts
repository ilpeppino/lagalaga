export type BreadcrumbCategory = 'navigation' | 'http' | 'user' | 'error' | 'info' | 'push';

export interface Breadcrumb {
  category: BreadcrumbCategory;
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  data?: Record<string, unknown>;
  timestamp?: number;
}

export interface MonitoringUser {
  id: string;
  username?: string;
  [key: string]: unknown;
}

export interface MonitoringProvider {
  captureError(error: Error, context?: Record<string, unknown>): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
  setUser(user: MonitoringUser | null): void;
  addBreadcrumb(breadcrumb: Breadcrumb): void;
}
