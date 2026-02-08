# Logging System Documentation

## Overview

LagaLaga uses a comprehensive logging system with structured logging on the backend (Pino) and a custom logger service on the frontend. The system includes PII sanitization, correlation IDs for request tracing, and consistent log levels across both platforms.

## 1. Backend Pino Configuration

### Log Levels

The backend uses Pino with the following log levels:

- `debug` (10): Detailed debugging information
- `info` (20): General informational messages
- `warn` (30): Warning messages for potentially problematic situations
- `error` (40): Error messages for failures that need attention
- `fatal` (50): Critical errors that may cause application termination

### Development vs Production

**Development Mode:**
```typescript
// Uses pino-pretty for human-readable output
const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  }
});
```

**Production Mode:**
```typescript
// Structured JSON logging for log aggregation services
const logger = pino({
  level: 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

### Custom Serializers

Pino serializers are configured to handle common objects:

```typescript
const logger = pino({
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});
```

## 2. PII Sanitization

### Protected Keys

The sanitizer automatically redacts the following sensitive keys:

- `password`
- `token`
- `accessToken`
- `refreshToken`
- `secret`
- `authorization`
- `codeVerifier`
- `codeChallenge`
- `apiKey`
- `privateKey`
- `sessionId`
- `csrfToken`

### Sanitizer Implementation

The `sanitizer.ts` module provides recursive sanitization:

```typescript
// sanitizer.ts
const SENSITIVE_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'codeVerifier',
  'codeChallenge',
  'apiKey',
  'privateKey',
  'sessionId',
  'csrfToken',
];

export function sanitizeObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
```

**Usage:**
```typescript
import { sanitizeObject } from './sanitizer';

logger.info('User authenticated', sanitizeObject({
  user: { id: 123, email: 'user@example.com' },
  accessToken: 'secret-token-here',
  refreshToken: 'secret-refresh-token',
}));

// Output:
// User authenticated { user: { id: 123, email: 'user@example.com' }, accessToken: '[REDACTED]', refreshToken: '[REDACTED]' }
```

## 3. Frontend Logger Service

### Logger Singleton

The frontend uses a singleton Logger service with multiple transports:

```typescript
// Logger.ts
class Logger {
  private static instance: Logger;
  private transports: LogTransport[] = [];
  private context: Record<string, any> = {};

  private constructor() {
    if (__DEV__) {
      this.transports.push(new ConsoleTransport());
    }
    this.transports.push(new RingBufferTransport(100));
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public withContext(context: Record<string, any>): Logger {
    const childLogger = Object.create(this);
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  // Log methods...
}

export const logger = Logger.getInstance();
```

### Transports

**ConsoleTransport** (Development Only):
```typescript
class ConsoleTransport implements LogTransport {
  log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

    switch (level) {
      case 'debug':
      case 'info':
        console.log(formatted, data || '');
        break;
      case 'warn':
        console.warn(formatted, data || '');
        break;
      case 'error':
      case 'fatal':
        console.error(formatted, data || '');
        break;
    }
  }
}
```

**RingBufferTransport** (Always Active):
```typescript
class RingBufferTransport implements LogTransport {
  private buffer: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift(); // Remove oldest entry
    }
  }

  getEntries(): LogEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }
}
```

### Child Loggers with Context

Create child loggers with persistent context:

```typescript
// Create a child logger for authentication flows
const authLogger = logger.withContext({ module: 'auth' });

authLogger.info('Starting OAuth flow', { provider: 'google' });
// Logs: { module: 'auth', message: 'Starting OAuth flow', provider: 'google' }

// Create a nested child logger
const oauthLogger = authLogger.withContext({ flow: 'oauth' });
oauthLogger.debug('Generating code challenge');
// Logs: { module: 'auth', flow: 'oauth', message: 'Generating code challenge' }
```

## 4. Log Levels

### When to Use Each Level

**Debug** (`logger.debug()`):
- Detailed information for debugging
- Function entry/exit points
- Variable values during development
- Should not appear in production logs

```typescript
logger.debug('Entering validateToken function', { tokenLength: token.length });
```

**Info** (`logger.info()`):
- Normal operational messages
- User actions (login, logout, profile updates)
- Successful API requests
- Application lifecycle events

```typescript
logger.info('User logged in successfully', { userId: user.id });
```

**Warn** (`logger.warn()`):
- Potentially problematic situations
- Deprecated API usage
- Recoverable errors
- Performance issues

```typescript
logger.warn('Token expires soon', { expiresIn: 300, userId: user.id });
```

**Error** (`logger.error()`):
- Error conditions that require attention
- Failed API requests
- Caught exceptions
- Business logic failures

```typescript
logger.error('Failed to refresh token', {
  error: err.message,
  userId: user.id
});
```

**Fatal** (`logger.fatal()`):
- Critical errors that may cause application termination
- Unrecoverable database connection failures
- Missing critical configuration
- Should trigger alerts

```typescript
logger.fatal('Database connection lost', { error: err.message });
```

## 5. Correlation IDs

### Request Tracing Headers

**X-Correlation-ID** (Client to Server):
- Generated by the client for each request
- Passed in request headers
- Allows tracing a single user action across multiple API calls

**X-Request-ID** (Server Response):
- Generated by the server for each request
- Returned in response headers
- Uniquely identifies the server-side processing of a request

### Implementation

**Frontend (Axios Interceptor):**
```typescript
import { v4 as uuidv4 } from 'uuid';

axios.interceptors.request.use((config) => {
  const correlationId = uuidv4();
  config.headers['X-Correlation-ID'] = correlationId;

  // Store for logging
  config.metadata = { correlationId };

  return config;
});

axios.interceptors.response.use(
  (response) => {
    const requestId = response.headers['x-request-id'];
    const correlationId = response.config.metadata?.correlationId;

    logger.debug('API response received', {
      correlationId,
      requestId,
      status: response.status,
      url: response.config.url,
    });

    return response;
  },
  (error) => {
    const correlationId = error.config?.metadata?.correlationId;
    logger.error('API request failed', {
      correlationId,
      error: error.message,
      url: error.config?.url,
    });
    throw error;
  }
);
```

**Backend (Express Middleware):**
```typescript
import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
  // Get correlation ID from client or generate new one
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  const requestId = uuidv4();

  // Attach to request for use in handlers
  req.correlationId = correlationId;
  req.requestId = requestId;

  // Return request ID to client
  res.setHeader('X-Request-ID', requestId);

  // Add to logger context
  req.log = logger.child({ correlationId, requestId });

  next();
});
```

### Cross-Layer Tracing

Both IDs are logged together for complete tracing:

```typescript
// Client initiates request
logger.info('Fetching user profile', { correlationId: 'abc-123' });
// API request sent with X-Correlation-ID: abc-123

// Server receives request
req.log.info('Processing user profile request', {
  correlationId: 'abc-123',  // From client
  requestId: 'xyz-789',       // Generated by server
  userId: req.user.id,
});

// Server responds with X-Request-ID: xyz-789

// Client logs response
logger.info('User profile received', {
  correlationId: 'abc-123',
  requestId: 'xyz-789',
});
```

This allows you to:
1. Trace all client actions with the same correlationId
2. Identify specific server requests with requestId
3. Connect frontend and backend logs for a complete picture

## 6. Replacing console.error

### Migration Pattern

**Before:**
```typescript
try {
  await authenticateUser(credentials);
} catch (err) {
  console.error('Authentication failed', err);
}
```

**After:**
```typescript
try {
  await authenticateUser(credentials);
} catch (err) {
  logger.error('Authentication failed', {
    error: err.message,
    stack: err.stack,
    code: err.code,
  });
}
```

### Why Migrate?

1. **Structured Data**: Object-based logging enables better querying
2. **PII Sanitization**: Automatic redaction of sensitive information
3. **Correlation**: Integrated with request tracing
4. **Context**: Child loggers include module/component context
5. **Log Levels**: Proper severity classification
6. **Production Ready**: JSON output for log aggregation services

### Migration Checklist

- [ ] Replace `console.log()` with `logger.debug()` or `logger.info()`
- [ ] Replace `console.warn()` with `logger.warn()`
- [ ] Replace `console.error()` with `logger.error()`
- [ ] Extract error properties instead of logging entire error object
- [ ] Add contextual data as second parameter
- [ ] Use child loggers for module-specific logging

## 7. Logging Examples

### logRequestStart

```typescript
// Backend middleware
export function logRequestStart(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  req.log.info('Request started', {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  res.locals.startTime = startTime;
  next();
}
```

### logRequestEnd

```typescript
// Backend middleware
export function logRequestEnd(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;

  res.send = function (data: any) {
    const duration = Date.now() - res.locals.startTime;

    req.log.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      responseSize: data?.length || 0,
    });

    return originalSend.call(this, data);
  };

  next();
}
```

### logError

```typescript
// Backend error handler
export function logError(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sanitized = sanitizeObject({
    error: err.message,
    stack: err.stack,
    code: err.code,
    method: req.method,
    url: req.url,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  req.log.error('Request error', sanitized);

  res.status(err.statusCode || 500).json({
    error: err.message,
    requestId: req.requestId,
  });
}
```

### logAuthEvent

```typescript
// Backend auth service
export function logAuthEvent(
  event: 'login' | 'logout' | 'token_refresh' | 'token_revoke',
  userId: string,
  data?: Record<string, any>
) {
  logger.info('Auth event', sanitizeObject({
    event,
    userId,
    timestamp: Date.now(),
    ...data,
  }));
}

// Usage
logAuthEvent('login', user.id, {
  provider: 'google',
  ipAddress: req.ip,
});

logAuthEvent('token_refresh', user.id, {
  expiresIn: 3600,
});
```

### logSessionEvent

```typescript
// Backend session service
export function logSessionEvent(
  event: 'created' | 'destroyed' | 'expired' | 'refreshed',
  sessionId: string,
  data?: Record<string, any>
) {
  logger.info('Session event', sanitizeObject({
    event,
    sessionId: '[REDACTED]', // Session IDs are sensitive
    timestamp: Date.now(),
    ...data,
  }));
}

// Usage
logSessionEvent('created', session.id, {
  userId: user.id,
  expiresAt: session.expiresAt,
});

logSessionEvent('expired', session.id, {
  userId: user.id,
  reason: 'timeout',
});
```

### logWithCorrelation

```typescript
// Frontend API service
export async function fetchWithLogging<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const correlationId = uuidv4();

  logger.info('API request started', {
    correlationId,
    url,
    method: options?.method || 'GET',
  });

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        'X-Correlation-ID': correlationId,
      },
    });

    const requestId = response.headers.get('X-Request-ID');

    if (!response.ok) {
      logger.error('API request failed', {
        correlationId,
        requestId,
        url,
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    logger.info('API request completed', {
      correlationId,
      requestId,
      url,
      status: response.status,
    });

    return data;
  } catch (error) {
    logger.error('API request error', {
      correlationId,
      url,
      error: error.message,
    });
    throw error;
  }
}

// Usage
const user = await fetchWithLogging<User>('/api/user/profile');
```

### Complete OAuth Flow Example

```typescript
// Frontend OAuth flow with comprehensive logging
export async function initiateOAuthFlow(provider: string) {
  const authLogger = logger.withContext({ module: 'oauth', provider });
  const correlationId = uuidv4();

  authLogger.info('OAuth flow started', { correlationId });

  try {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    authLogger.debug('PKCE parameters generated', {
      correlationId,
      codeChallengeMethod: 'S256',
    });

    // Store code verifier (sanitized in logs)
    await secureStorage.set('codeVerifier', codeVerifier);

    authLogger.debug('Code verifier stored', { correlationId });

    // Build authorization URL
    const authUrl = buildAuthUrl(provider, codeChallenge);

    authLogger.info('Redirecting to provider', {
      correlationId,
      provider,
    });

    // Redirect user
    window.location.href = authUrl;

  } catch (error) {
    authLogger.error('OAuth flow failed', {
      correlationId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
```

## Best Practices

1. **Always use structured logging**: Pass data as objects, not in message strings
2. **Sanitize sensitive data**: Use `sanitizeObject()` before logging user data
3. **Include correlation IDs**: Track requests across frontend and backend
4. **Use appropriate log levels**: Don't log everything at `info` level
5. **Create child loggers**: Use `withContext()` for module-specific logging
6. **Log errors properly**: Extract error properties instead of logging raw error objects
7. **Keep messages concise**: Let the data object provide details
8. **Don't log in loops**: Aggregate data and log once
9. **Use debug level liberally in development**: Disable in production
10. **Monitor log volume**: Excessive logging impacts performance

## Testing Logs

### View Recent Logs (Frontend)

```typescript
// Get last 100 log entries from ring buffer
const recentLogs = Logger.getInstance()
  .getTransport(RingBufferTransport)
  .getEntries();

console.table(recentLogs);
```

### Filter Logs by Level

```typescript
const errorLogs = recentLogs.filter(entry => entry.level === 'error');
```

### Export Logs for Debugging

```typescript
export function exportLogs(): string {
  const logs = Logger.getInstance()
    .getTransport(RingBufferTransport)
    .getEntries();

  return JSON.stringify(logs, null, 2);
}

// Usage in debug screen
<Button onPress={() => Share.share({ message: exportLogs() })}>
  Export Logs
</Button>
```

## Summary

The LagaLaga logging system provides:

- **Structured logging** with Pino (backend) and custom Logger (frontend)
- **Automatic PII sanitization** to protect sensitive data
- **Correlation IDs** for cross-layer request tracing
- **Multiple transports** including console (dev) and ring buffer (production)
- **Child loggers** with persistent context
- **Consistent log levels** across platforms

This system enables effective debugging, monitoring, and troubleshooting while maintaining security and performance.
