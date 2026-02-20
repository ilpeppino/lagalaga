# Monitoring & Observability

This document provides comprehensive guidance on monitoring, health checks, metrics collection, error tracking, and observability best practices for the LagaLaga platform.

## Table of Contents

1. [Health Check Endpoints](#health-check-endpoints)
2. [Metrics Endpoints](#metrics-endpoints)
3. [Monitoring Provider Interface](#monitoring-provider-interface)
4. [Backend Monitoring Service](#backend-monitoring-service)
5. [Frontend Monitoring Service](#frontend-monitoring-service)
6. [Adding Third-Party Providers](#adding-third-party-providers)
7. [Alerting Thresholds](#alerting-thresholds)
8. [Error Recovery Utilities](#error-recovery-utilities)

---

## Health Check Endpoints

Health check endpoints provide real-time status information about the application's operational state.

### Lightweight Health Check

**Endpoint:** `GET /health`

A simple, fast health check that returns minimal information. Designed for load balancers and orchestration systems.

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "error"
}
```

**Use Cases:**
- Load balancer health checks
- Container orchestration (Kubernetes liveness probes)
- Quick availability verification

**Implementation Notes:**
- Should execute in <10ms
- No database connections or external dependencies
- Returns 200 if the process is running and can accept requests
- Returns 503 if shutting down or in maintenance mode

### Detailed Health Check

**Endpoint:** `GET /health/detailed`

A comprehensive health check that validates critical dependencies and system resources.

**Response (200 OK - Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-08T14:30:00.000Z",
  "version": "1.2.3",
  "environment": "production",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 15,
      "message": "Connected to PostgreSQL"
    },
    "memory": {
      "status": "healthy",
      "usage": 65.3,
      "total": 2048,
      "used": 1337,
      "percentage": 65.3
    },
    "disk": {
      "status": "healthy",
      "usage": 45.2
    }
  }
}
```

**Response (200 OK - Degraded):**
```json
{
  "status": "degraded",
  "timestamp": "2026-02-08T14:30:00.000Z",
  "version": "1.2.3",
  "environment": "production",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "degraded",
      "latency": 2500,
      "message": "High database latency"
    },
    "memory": {
      "status": "degraded",
      "usage": 82.5,
      "total": 2048,
      "used": 1689,
      "percentage": 82.5
    }
  }
}
```

**Response (503 Service Unavailable - Unhealthy):**
```json
{
  "status": "unhealthy",
  "timestamp": "2026-02-08T14:30:00.000Z",
  "version": "1.2.3",
  "environment": "production",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "unhealthy",
      "error": "Connection timeout after 5000ms",
      "message": "Unable to connect to database"
    },
    "memory": {
      "status": "unhealthy",
      "usage": 95.8,
      "total": 2048,
      "used": 1962,
      "percentage": 95.8
    }
  }
}
```

**Status Levels:**
- `healthy`: All systems operational
- `degraded`: System functional but performance impacted
- `unhealthy`: Critical issues preventing normal operation

**Included Checks:**
- **Database Ping**: Executes `SELECT 1` query and measures latency
- **Memory Usage**: Heap usage percentage and absolute values
- **Uptime**: Process uptime in seconds
- **Version**: Application version from package.json
- **Environment**: Current deployment environment

**Use Cases:**
- Monitoring dashboards
- Detailed troubleshooting
- Pre-deployment verification
- Kubernetes readiness probes

---

## Metrics Endpoints

Metrics endpoints expose time-series data for monitoring and alerting systems.

### Prometheus Format

**Endpoint:** `GET /metrics`

Returns metrics in Prometheus text format for scraping by Prometheus or compatible systems.

**Response (200 OK):**
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/users",status="200"} 1234
http_requests_total{method="POST",route="/api/users",status="201"} 567
http_requests_total{method="GET",route="/api/users",status="404"} 12

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/users",le="0.005"} 100
http_request_duration_seconds_bucket{method="GET",route="/api/users",le="0.01"} 250
http_request_duration_seconds_bucket{method="GET",route="/api/users",le="0.025"} 800
http_request_duration_seconds_bucket{method="GET",route="/api/users",le="0.05"} 950
http_request_duration_seconds_bucket{method="GET",route="/api/users",le="0.1"} 1200
http_request_duration_seconds_bucket{method="GET",route="/api/users",le="+Inf"} 1234
http_request_duration_seconds_sum{method="GET",route="/api/users"} 23.45
http_request_duration_seconds_count{method="GET",route="/api/users"} 1234

# HELP http_request_errors_total Total number of HTTP request errors
# TYPE http_request_errors_total counter
http_request_errors_total{method="GET",route="/api/users",status="500"} 5
http_request_errors_total{method="POST",route="/api/users",status="400"} 23

# HELP nodejs_heap_bytes Node.js heap size in bytes
# TYPE nodejs_heap_bytes gauge
nodejs_heap_bytes{type="total"} 2147483648
nodejs_heap_bytes{type="used"} 1402438144
```

**Content-Type:** `text/plain; version=0.0.4; charset=utf-8`

### JSON Format

**Endpoint:** `GET /metrics/json`

Returns metrics in JSON format for custom monitoring solutions or debugging.

**Response (200 OK):**
```json
{
  "timestamp": "2026-02-08T14:30:00.000Z",
  "metrics": {
    "http_requests_total": [
      {
        "labels": { "method": "GET", "route": "/api/users", "status": "200" },
        "value": 1234
      },
      {
        "labels": { "method": "POST", "route": "/api/users", "status": "201" },
        "value": 567
      }
    ],
    "http_request_duration_seconds": {
      "sum": 23.45,
      "count": 1234,
      "buckets": [
        { "le": 0.005, "count": 100 },
        { "le": 0.01, "count": 250 },
        { "le": 0.025, "count": 800 },
        { "le": 0.05, "count": 950 },
        { "le": 0.1, "count": 1200 }
      ]
    },
    "http_request_errors_total": [
      {
        "labels": { "method": "GET", "route": "/api/users", "status": "500" },
        "value": 5
      }
    ],
    "nodejs_heap_bytes": {
      "total": 2147483648,
      "used": 1402438144,
      "percentage": 65.3
    }
  }
}
```

### Tracked Metrics

#### http_requests_total
**Type:** Counter
**Description:** Total number of HTTP requests
**Labels:**
- `method`: HTTP method (GET, POST, PUT, DELETE, etc.)
- `route`: Normalized route path (e.g., `/api/users/:id`)
- `status`: HTTP status code

**Usage:**
```typescript
metrics.incrementHttpRequests('GET', '/api/users', 200);
```

#### http_request_duration_seconds
**Type:** Histogram
**Description:** HTTP request duration in seconds
**Labels:**
- `method`: HTTP method
- `route`: Normalized route path

**Buckets:** [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

**Usage:**
```typescript
const timer = metrics.startTimer();
// ... handle request ...
timer.end('GET', '/api/users');
```

#### http_request_errors_total
**Type:** Counter
**Description:** Total number of HTTP request errors (4xx and 5xx)
**Labels:**
- `method`: HTTP method
- `route`: Normalized route path
- `status`: HTTP status code

**Usage:**
```typescript
metrics.incrementHttpErrors('POST', '/api/users', 400);
```

#### nodejs_heap_bytes
**Type:** Gauge
**Description:** Node.js heap memory usage in bytes
**Labels:**
- `type`: Memory type (total, used, external, rss)

**Usage:**
```typescript
metrics.updateHeapMetrics();
```

**Additional Available Metrics:**
- `process_cpu_user_seconds_total`: User CPU time
- `process_cpu_system_seconds_total`: System CPU time
- `process_start_time_seconds`: Process start time
- `nodejs_eventloop_lag_seconds`: Event loop lag
- `database_query_duration_seconds`: Database query duration
- `database_connections_active`: Active database connections

---

## Monitoring Provider Interface

The monitoring system uses a provider pattern to support multiple monitoring backends (console, Sentry, DataDog, etc.).

**Location:** `shared/monitoring/types.ts`

```typescript
export interface MonitoringProvider {
  /**
   * Capture an error with optional context
   * @param error - The error object or message
   * @param context - Additional context about the error
   */
  captureError(error: Error | string, context?: ErrorContext): void;

  /**
   * Capture an informational message
   * @param message - The message to log
   * @param level - Severity level (info, warning, error)
   * @param context - Additional context
   */
  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    context?: Record<string, any>
  ): void;

  /**
   * Set the current user context
   * @param user - User information
   */
  setUser(user: UserContext | null): void;

  /**
   * Add a breadcrumb for debugging
   * @param breadcrumb - Navigation or action breadcrumb
   */
  addBreadcrumb(breadcrumb: Breadcrumb): void;
}

export interface ErrorContext {
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  fingerprint?: string[];
}

export interface UserContext {
  id: string;
  email?: string;
  username?: string;
  [key: string]: any;
}

export interface Breadcrumb {
  type: 'navigation' | 'http' | 'user' | 'error' | 'default';
  category?: string;
  message?: string;
  data?: Record<string, any>;
  level?: 'info' | 'warning' | 'error';
  timestamp?: number;
}
```

**Usage Example:**
```typescript
import { monitoring } from '@/shared/monitoring';

// Capture an error
try {
  await riskyOperation();
} catch (error) {
  monitoring.captureError(error, {
    tags: { operation: 'user-registration' },
    extra: { userId: user.id },
    level: 'error'
  });
}

// Capture a message
monitoring.captureMessage('Payment processed successfully', 'info', {
  orderId: order.id,
  amount: order.total
});

// Set user context
monitoring.setUser({
  id: user.id,
  email: user.email,
  username: user.username
});

// Add breadcrumb
monitoring.addBreadcrumb({
  type: 'navigation',
  category: 'navigation',
  message: 'User navigated to profile page',
  data: { from: '/dashboard', to: '/profile' }
});
```

---

## Backend Monitoring Service

The backend uses Pino for structured logging with a console-based monitoring provider by default.

### ConsoleMonitoringProvider

**Location:** `backend/src/monitoring/console-provider.ts`

```typescript
import { MonitoringProvider, ErrorContext, UserContext, Breadcrumb } from '@/shared/monitoring/types';
import { logger } from '@/utils/logger';

export class ConsoleMonitoringProvider implements MonitoringProvider {
  private userContext: UserContext | null = null;
  private breadcrumbs: Breadcrumb[] = [];

  captureError(error: Error | string, context?: ErrorContext): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;

    logger.error({
      err: errorObj,
      tags: context?.tags,
      extra: context?.extra,
      level: context?.level,
      user: this.userContext,
      breadcrumbs: this.breadcrumbs.slice(-10) // Last 10 breadcrumbs
    }, errorObj.message);
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    context?: Record<string, any>
  ): void {
    const logMethod = logger[level] || logger.info;
    logMethod({
      ...context,
      user: this.userContext
    }, message);
  }

  setUser(user: UserContext | null): void {
    this.userContext = user;
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: breadcrumb.timestamp || Date.now()
    });

    // Keep only last 100 breadcrumbs
    if (this.breadcrumbs.length > 100) {
      this.breadcrumbs = this.breadcrumbs.slice(-100);
    }
  }
}
```

**Features:**
- Logs errors with structured data to Pino
- Maintains user context across requests
- Tracks breadcrumbs for debugging
- Automatic cleanup of old breadcrumbs

### Swapping Providers

To use a different monitoring provider (e.g., Sentry), call `setProvider()` at application startup:

```typescript
// backend/src/app.ts
import { monitoring } from '@/shared/monitoring';
import { SentryMonitoringProvider } from '@/monitoring/sentry-provider';

// Initialize Sentry provider
const sentryProvider = new SentryMonitoringProvider({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION
});

// Set as active provider
monitoring.setProvider(sentryProvider);

// Now all monitoring calls use Sentry
monitoring.captureError(new Error('Test error'));
```

**Best Practices:**
- Set the provider as early as possible in the application lifecycle
- Use environment variables for provider configuration
- Keep the console provider in development for easier debugging
- Test provider integration in staging before production deployment

---

## Frontend Monitoring Service

The frontend monitoring service provides client-side error tracking and user behavior monitoring.

### ConsoleMonitoringProvider

**Location:** `mobile/src/services/monitoring/console-provider.ts`

```typescript
import { MonitoringProvider, ErrorContext, UserContext, Breadcrumb } from '@/shared/monitoring/types';
import { Logger } from '@/utils/logger';

export class ConsoleMonitoringProvider implements MonitoringProvider {
  private userContext: UserContext | null = null;
  private breadcrumbs: Breadcrumb[] = [];

  captureError(error: Error | string, context?: ErrorContext): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;

    Logger.error('Error captured', {
      error: errorObj.message,
      stack: errorObj.stack,
      tags: context?.tags,
      extra: context?.extra,
      level: context?.level,
      user: this.userContext,
      breadcrumbs: this.breadcrumbs.slice(-10)
    });
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    context?: Record<string, any>
  ): void {
    const logMethod = Logger[level] || Logger.info;
    logMethod(message, {
      ...context,
      user: this.userContext
    });
  }

  setUser(user: UserContext | null): void {
    this.userContext = user;
    Logger.info('User context updated', { userId: user?.id });
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: breadcrumb.timestamp || Date.now()
    });

    // Keep only last 50 breadcrumbs for mobile
    if (this.breadcrumbs.length > 50) {
      this.breadcrumbs = this.breadcrumbs.slice(-50);
    }
  }
}
```

### Automatic Tracking

#### Navigation Tracking

```typescript
// mobile/src/services/monitoring/navigation-tracker.ts
import { monitoring } from '@/shared/monitoring';

export function trackNavigation(from: string, to: string, params?: any): void {
  monitoring.addBreadcrumb({
    type: 'navigation',
    category: 'navigation',
    message: `Navigated from ${from} to ${to}`,
    data: {
      from,
      to,
      params
    },
    level: 'info'
  });
}

// Usage in navigation container
navigation.addListener('state', (event) => {
  const previousRoute = getPreviousRoute(event.data.state);
  const currentRoute = getCurrentRoute(event.data.state);

  trackNavigation(
    previousRoute.name,
    currentRoute.name,
    currentRoute.params
  );
});
```

#### HTTP Request Tracking

```typescript
// mobile/src/services/monitoring/http-tracker.ts
import { monitoring } from '@/shared/monitoring';
import axios, { AxiosError, AxiosResponse } from 'axios';

export function trackHttpRequest(
  method: string,
  url: string,
  status: number,
  duration: number,
  error?: AxiosError
): void {
  monitoring.addBreadcrumb({
    type: 'http',
    category: 'http',
    message: `${method} ${url} - ${status}`,
    data: {
      method,
      url,
      status,
      duration,
      error: error ? {
        message: error.message,
        code: error.code
      } : undefined
    },
    level: status >= 400 ? 'error' : 'info'
  });
}

// Axios interceptor
axios.interceptors.request.use((config) => {
  config.metadata = { startTime: Date.now() };
  return config;
});

axios.interceptors.response.use(
  (response: AxiosResponse) => {
    const duration = Date.now() - response.config.metadata.startTime;
    trackHttpRequest(
      response.config.method?.toUpperCase() || 'GET',
      response.config.url || '',
      response.status,
      duration
    );
    return response;
  },
  (error: AxiosError) => {
    const duration = Date.now() - error.config?.metadata?.startTime || 0;
    trackHttpRequest(
      error.config?.method?.toUpperCase() || 'GET',
      error.config?.url || '',
      error.response?.status || 0,
      duration,
      error
    );
    throw error;
  }
);
```

#### User Context Management

```typescript
// mobile/src/services/monitoring/user-context.ts
import { monitoring } from '@/shared/monitoring';

export function updateUserContext(user: User | null): void {
  if (user) {
    monitoring.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt
    });
  } else {
    monitoring.setUser(null);
  }
}

// Usage in auth flow
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (credentials: LoginCredentials) => {
    const authenticatedUser = await authService.login(credentials);
    setUser(authenticatedUser);
    updateUserContext(authenticatedUser);
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    updateUserContext(null);
  };

  return { user, login, logout };
};
```

---

## Adding Third-Party Providers

To integrate with third-party monitoring services like Sentry or DataDog, implement the `MonitoringProvider` interface.

### Sentry Integration Example

```typescript
// shared/monitoring/sentry-provider.ts
import * as Sentry from '@sentry/node'; // or @sentry/react-native
import { MonitoringProvider, ErrorContext, UserContext, Breadcrumb } from './types';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate?: number;
  beforeSend?: (event: Sentry.Event) => Sentry.Event | null;
}

export class SentryMonitoringProvider implements MonitoringProvider {
  constructor(config: SentryConfig) {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.tracesSampleRate || 0.1,
      beforeSend: config.beforeSend
    });
  }

  captureError(error: Error | string, context?: ErrorContext): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;

    Sentry.withScope((scope) => {
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }

      if (context?.extra) {
        scope.setExtras(context.extra);
      }

      if (context?.level) {
        scope.setLevel(context.level as Sentry.SeverityLevel);
      }

      if (context?.fingerprint) {
        scope.setFingerprint(context.fingerprint);
      }

      Sentry.captureException(errorObj);
    });
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    context?: Record<string, any>
  ): void {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }

      Sentry.captureMessage(message, level as Sentry.SeverityLevel);
    });
  }

  setUser(user: UserContext | null): void {
    if (user) {
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.username,
        ...user
      });
    } else {
      Sentry.setUser(null);
    }
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    Sentry.addBreadcrumb({
      type: breadcrumb.type,
      category: breadcrumb.category,
      message: breadcrumb.message,
      data: breadcrumb.data,
      level: breadcrumb.level as Sentry.SeverityLevel,
      timestamp: breadcrumb.timestamp ? breadcrumb.timestamp / 1000 : undefined
    });
  }
}
```

### DataDog Integration Skeleton

```typescript
// shared/monitoring/datadog-provider.ts
import { MonitoringProvider, ErrorContext, UserContext, Breadcrumb } from './types';

export interface DataDogConfig {
  clientToken: string;
  applicationId: string;
  environment: string;
  service: string;
  version?: string;
}

export class DataDogMonitoringProvider implements MonitoringProvider {
  private userContext: UserContext | null = null;

  constructor(config: DataDogConfig) {
    // Initialize DataDog SDK
    // DD_RUM.init({
    //   clientToken: config.clientToken,
    //   applicationId: config.applicationId,
    //   env: config.environment,
    //   service: config.service,
    //   version: config.version
    // });
  }

  captureError(error: Error | string, context?: ErrorContext): void {
    // DD_LOGS.logger.error(
    //   typeof error === 'string' ? error : error.message,
    //   {
    //     error: typeof error === 'string' ? new Error(error) : error,
    //     ...context?.extra,
    //     tags: context?.tags,
    //     user: this.userContext
    //   }
    // );
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    context?: Record<string, any>
  ): void {
    // DD_LOGS.logger[level](message, {
    //   ...context,
    //   user: this.userContext
    // });
  }

  setUser(user: UserContext | null): void {
    this.userContext = user;
    // DD_RUM.setUser(user ? {
    //   id: user.id,
    //   email: user.email,
    //   name: user.username
    // } : undefined);
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    // DD_RUM.addAction(breadcrumb.message || breadcrumb.type, {
    //   type: breadcrumb.type,
    //   category: breadcrumb.category,
    //   ...breadcrumb.data
    // });
  }
}
```

### Provider Setup at Startup

```typescript
// backend/src/app.ts
import { monitoring } from '@/shared/monitoring';
import { SentryMonitoringProvider } from '@/shared/monitoring/sentry-provider';
import { ConsoleMonitoringProvider } from '@/monitoring/console-provider';

function initializeMonitoring() {
  if (process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
    const sentryProvider = new SentryMonitoringProvider({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      release: process.env.APP_VERSION,
      tracesSampleRate: 0.1
    });
    monitoring.setProvider(sentryProvider);
  } else {
    monitoring.setProvider(new ConsoleMonitoringProvider());
  }
}

initializeMonitoring();
```

```typescript
// mobile/src/App.tsx
import { monitoring } from '@/shared/monitoring';
import { SentryMonitoringProvider } from '@/shared/monitoring/sentry-provider';
import { ConsoleMonitoringProvider } from '@/services/monitoring/console-provider';

function initializeMonitoring() {
  if (__DEV__) {
    monitoring.setProvider(new ConsoleMonitoringProvider());
  } else {
    const sentryProvider = new SentryMonitoringProvider({
      dsn: Config.SENTRY_DSN,
      environment: Config.ENVIRONMENT,
      release: Config.APP_VERSION,
      tracesSampleRate: 0.05 // Lower sampling rate for mobile
    });
    monitoring.setProvider(sentryProvider);
  }
}

initializeMonitoring();
```

---

## Alerting Thresholds

Recommended thresholds for monitoring alerts based on health checks and metrics.

### Health Check Thresholds

#### Memory Usage

| Status | Threshold | Description |
|--------|-----------|-------------|
| Healthy | < 75% | Normal operation |
| Degraded | 75% - 90% | High memory usage, monitor closely |
| Unhealthy | > 90% | Critical memory usage, possible OOM |

**Alert Configuration:**
```yaml
# Prometheus alert rule
- alert: HighMemoryUsage
  expr: (nodejs_heap_bytes{type="used"} / nodejs_heap_bytes{type="total"}) > 0.75
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High memory usage (instance {{ $labels.instance }})"
    description: "Memory usage is {{ $value | humanizePercentage }}."

- alert: CriticalMemoryUsage
  expr: (nodejs_heap_bytes{type="used"} / nodejs_heap_bytes{type="total"}) > 0.90
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Critical memory usage (instance {{ $labels.instance }})"
    description: "Memory usage is {{ $value | humanizePercentage }}."
```

#### Database Latency

| Status | Threshold | Description |
|--------|-----------|-------------|
| Healthy | < 100ms | Optimal performance |
| Degraded | 100ms - 2000ms | Elevated latency, investigate |
| Unhealthy | > 2000ms | Critical latency, immediate action |

**Alert Configuration:**
```yaml
- alert: HighDatabaseLatency
  expr: database_query_duration_seconds{quantile="0.95"} > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High database latency (instance {{ $labels.instance }})"
    description: "95th percentile query latency is {{ $value }}s."

- alert: CriticalDatabaseLatency
  expr: database_query_duration_seconds{quantile="0.95"} > 2
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Critical database latency (instance {{ $labels.instance }})"
    description: "95th percentile query latency is {{ $value }}s."
```

#### CPU Usage

| Status | Threshold | Description |
|--------|-----------|-------------|
| Healthy | < 70% | Normal operation |
| Degraded | 70% - 85% | High CPU usage |
| Unhealthy | > 85% | Critical CPU usage |

**Alert Configuration:**
```yaml
- alert: HighCPUUsage
  expr: rate(process_cpu_user_seconds_total[5m]) > 0.7
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High CPU usage (instance {{ $labels.instance }})"
    description: "CPU usage is {{ $value | humanizePercentage }}."
```

### Error Rate Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| Error Rate | > 1% | Warning: Elevated error rate |
| Error Rate | > 5% | Critical: High error rate |
| 5xx Errors | > 0.1% | Warning: Server errors detected |
| 5xx Errors | > 1% | Critical: High server error rate |

**Alert Configuration:**
```yaml
- alert: HighErrorRate
  expr: |
    sum(rate(http_request_errors_total[5m]))
    /
    sum(rate(http_requests_total[5m]))
    > 0.01
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High error rate (instance {{ $labels.instance }})"
    description: "Error rate is {{ $value | humanizePercentage }}."

- alert: High5xxErrorRate
  expr: |
    sum(rate(http_requests_total{status=~"5.."}[5m]))
    /
    sum(rate(http_requests_total[5m]))
    > 0.001
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High 5xx error rate (instance {{ $labels.instance }})"
    description: "5xx error rate is {{ $value | humanizePercentage }}."
```

### Response Time Thresholds

| Percentile | Threshold | Description |
|------------|-----------|-------------|
| p50 | < 200ms | Median response time |
| p95 | < 500ms | 95th percentile warning |
| p95 | > 1000ms | 95th percentile critical |
| p99 | < 1000ms | 99th percentile warning |
| p99 | > 2000ms | 99th percentile critical |

**Alert Configuration:**
```yaml
- alert: SlowResponseTime
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Slow response time (instance {{ $labels.instance }})"
    description: "95th percentile response time is {{ $value }}s."

- alert: VerySlowResponseTime
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Very slow response time (instance {{ $labels.instance }})"
    description: "95th percentile response time is {{ $value }}s."
```

### Availability Thresholds

| SLA | Uptime | Allowed Downtime/Month |
|-----|--------|------------------------|
| 99.9% | High | 43.8 minutes |
| 99.95% | Very High | 21.9 minutes |
| 99.99% | Mission Critical | 4.38 minutes |

**Alert Configuration:**
```yaml
- alert: ServiceDown
  expr: up{job="lagalaga-api"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Service down (instance {{ $labels.instance }})"
    description: "Service has been down for more than 1 minute."

- alert: HealthCheckFailing
  expr: probe_success{job="health-check"} == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Health check failing (instance {{ $labels.instance }})"
    description: "Health check has been failing for more than 2 minutes."
```

---

## Error Recovery Utilities

Utilities for handling transient failures and implementing resilience patterns.

### Retry with Exponential Backoff

**Location:** `shared/utils/retry.ts`

```typescript
export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  shouldRetry: () => true,
  onRetry: () => {}
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxAttempts) {
        break;
      }

      // Don't retry if error shouldn't be retried
      if (!opts.shouldRetry(error)) {
        break;
      }

      // Calculate next delay with exponential backoff
      const currentDelay = Math.min(delay, opts.maxDelay);
      opts.onRetry(attempt, error, currentDelay);

      // Wait before retrying
      await sleep(currentDelay);

      // Increase delay for next attempt
      delay *= opts.backoffMultiplier;
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Usage:**
```typescript
import { withRetry } from '@/shared/utils/retry';
import { monitoring } from '@/shared/monitoring';

// Basic retry
const data = await withRetry(
  () => fetchUserData(userId),
  { maxAttempts: 3 }
);

// Retry with custom options
const result = await withRetry(
  () => api.post('/orders', orderData),
  {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    shouldRetry: (error) => {
      // Only retry on network errors or 5xx responses
      return error.isNetworkError || (error.response?.status >= 500);
    },
    onRetry: (attempt, error, delay) => {
      monitoring.captureMessage(
        `Retrying operation (attempt ${attempt})`,
        'warning',
        { error: error.message, delay }
      );
    }
  }
);

// Retry database operations
const user = await withRetry(
  () => database.users.findById(userId),
  {
    maxAttempts: 3,
    initialDelay: 100,
    shouldRetry: (error) => {
      // Retry on connection errors or deadlocks
      return error.code === 'ECONNRESET' || error.code === 'DEADLOCK';
    }
  }
);
```

### Circuit Breaker

**Location:** `shared/utils/circuit-breaker.ts`

```typescript
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  resetTimeout?: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  shouldTrackError?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 60000, // 60 seconds
  onStateChange: () => {},
  shouldTrackError: () => true
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN');
      }
      // Transition to HALF_OPEN to test if service recovered
      this.setState(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.setState(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  private onFailure(error: any): void {
    if (!this.options.shouldTrackError(error)) {
      return;
    }

    this.successCount = 0;
    this.failureCount++;

    if (this.failureCount >= this.options.failureThreshold) {
      this.setState(CircuitState.OPEN);
      this.nextAttemptTime = Date.now() + this.options.resetTimeout;
    }
  }

  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.options.onStateChange(oldState, newState);
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}
```

**Usage:**
```typescript
import { CircuitBreaker, CircuitState } from '@/shared/utils/circuit-breaker';
import { monitoring } from '@/shared/monitoring';

// Create circuit breaker for external API
const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 60000, // 1 minute
  onStateChange: (from, to) => {
    monitoring.captureMessage(
      `Circuit breaker state changed: ${from} -> ${to}`,
      to === CircuitState.OPEN ? 'error' : 'info'
    );
  },
  shouldTrackError: (error) => {
    // Only track 5xx errors, not client errors
    return error.response?.status >= 500;
  }
});

// Use circuit breaker
async function fetchExternalData(id: string) {
  try {
    return await apiCircuitBreaker.execute(
      () => externalApi.getData(id)
    );
  } catch (error) {
    if (error.message === 'Circuit breaker is OPEN') {
      // Return cached data or fallback
      return getCachedData(id);
    }
    throw error;
  }
}

// Monitor circuit breaker state
setInterval(() => {
  const metrics = apiCircuitBreaker.getMetrics();
  if (metrics.state !== CircuitState.CLOSED) {
    monitoring.captureMessage(
      'Circuit breaker not in CLOSED state',
      'warning',
      metrics
    );
  }
}, 30000); // Check every 30 seconds

// Reset circuit breaker manually (e.g., after deployment)
function resetCircuitBreakers() {
  apiCircuitBreaker.reset();
  monitoring.captureMessage('Circuit breakers reset', 'info');
}
```

### Combining Retry and Circuit Breaker

```typescript
import { withRetry } from '@/shared/utils/retry';
import { CircuitBreaker } from '@/shared/utils/circuit-breaker';

const paymentApiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000
});

async function processPayment(paymentData: PaymentData) {
  // First, try with circuit breaker
  return await paymentApiCircuitBreaker.execute(async () => {
    // Then, retry transient failures
    return await withRetry(
      () => paymentApi.process(paymentData),
      {
        maxAttempts: 3,
        initialDelay: 1000,
        shouldRetry: (error) => {
          // Only retry on network errors, not validation errors
          return error.isNetworkError;
        }
      }
    );
  });
}
```

---

## Best Practices

1. **Use Structured Logging**: Always log with context (user ID, request ID, etc.)
2. **Set User Context Early**: Call `monitoring.setUser()` immediately after authentication
3. **Add Breadcrumbs Liberally**: Track navigation, API calls, and user actions
4. **Monitor Critical Paths**: Ensure all payment, auth, and data operations are monitored
5. **Test Monitoring**: Regularly test error capture and alerting in staging
6. **Tune Alert Thresholds**: Adjust based on your traffic patterns and SLA requirements
7. **Use Circuit Breakers for External APIs**: Protect your system from cascading failures
8. **Implement Graceful Degradation**: Return cached/fallback data when services are unavailable
9. **Monitor Business Metrics**: Track signups, orders, and revenue alongside technical metrics
10. **Review Dashboards Weekly**: Regularly review metrics trends and adjust thresholds

---

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/)
- [Sentry Best Practices](https://docs.sentry.io/best-practices/)
- [The Twelve-Factor App - Logs](https://12factor.net/logs)
- [SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
