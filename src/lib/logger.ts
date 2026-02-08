/**
 * Frontend Logger Service
 *
 * - ConsoleTransport: wraps console.* with formatting, enabled only in __DEV__
 * - RingBufferTransport: always on, stores last 100 entries for crash reports
 * - PII sanitization before logging
 * - Replaces all console.error() usage across the app
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp: string;
}

interface LogTransport {
  log(entry: LogEntry): void;
}

// ---------------------------------------------------------------------------
// PII sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'accesstoken', 'access_token',
  'refreshtoken', 'refresh_token', 'secret', 'authorization',
  'codeverifier', 'code_verifier', 'codechallenge', 'code_challenge',
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

function sanitize(obj: unknown, seen = new WeakSet()): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (seen.has(obj as object)) return '[Circular]';
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

class ConsoleTransport implements LogTransport {
  log(entry: LogEntry): void {
    const prefix = `[${entry.level.toUpperCase()}]`;
    const ctx = entry.context ? ` (${JSON.stringify(entry.context)})` : '';
    const message = `${prefix} ${entry.message}${ctx}`;

    switch (entry.level) {
      case 'debug':
        console.debug(message, entry.data ?? '');
        break;
      case 'info':
        console.info(message, entry.data ?? '');
        break;
      case 'warn':
        console.warn(message, entry.data ?? '');
        break;
      case 'error':
      case 'fatal':
        console.error(message, entry.data ?? '');
        break;
    }
  }
}

class RingBufferTransport implements LogTransport {
  private buffer: LogEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  log(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getEntries(): LogEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

class Logger {
  private transports: LogTransport[] = [];
  private context: Record<string, unknown> = {};
  private minLevel: LogLevel;
  private ringBuffer: RingBufferTransport;

  constructor(minLevel: LogLevel = 'debug') {
    this.minLevel = minLevel;
    this.ringBuffer = new RingBufferTransport(100);
    this.transports.push(this.ringBuffer);

    // Add console transport in development
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      this.transports.push(new ConsoleTransport());
    }
  }

  /**
   * Create a child logger with additional context.
   */
  withContext(ctx: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, { ...this.context, ...ctx });
  }

  /**
   * Get recent log entries for crash reports.
   */
  getRecentEntries(): LogEntry[] {
    return this.ringBuffer.getEntries();
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data);
  }

  /** @internal — used by ChildLogger */
  _log(level: LogLevel, message: string, data?: Record<string, unknown>, context?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      level,
      message,
      data: data ? (sanitize(data) as Record<string, unknown>) : undefined,
      context: context ? (sanitize(context) as Record<string, unknown>) : undefined,
      timestamp: new Date().toISOString(),
    };

    for (const transport of this.transports) {
      transport.log(entry);
    }
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    this._log(level, message, data, Object.keys(this.context).length > 0 ? this.context : undefined);
  }
}

class ChildLogger {
  constructor(private parent: Logger, private context: Record<string, unknown>) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.parent._log('debug', message, data, this.context);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.parent._log('info', message, data, this.context);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.parent._log('warn', message, data, this.context);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.parent._log('error', message, data, this.context);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.parent._log('fatal', message, data, this.context);
  }
}

export const logger = new Logger();
export type { LogEntry, LogLevel };
