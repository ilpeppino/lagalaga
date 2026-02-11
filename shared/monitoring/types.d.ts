/**
 * Provider-agnostic monitoring interface.
 * Implementations can wrap Sentry, DataDog, or a simple console logger.
 */
export type BreadcrumbCategory = 'navigation' | 'http' | 'user' | 'error' | 'info';
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
    /** Capture and report an error */
    captureError(error: Error, context?: Record<string, unknown>): void;
    /** Capture an informational message */
    captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
    /** Set current user context for error reports */
    setUser(user: MonitoringUser | null): void;
    /** Add a breadcrumb for tracing user/system actions */
    addBreadcrumb(breadcrumb: Breadcrumb): void;
}
//# sourceMappingURL=types.d.ts.map