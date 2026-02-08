import { ErrorCodes, type ErrorSeverity } from '../../../shared/errors/codes.js';

export { ErrorCodes };

export interface AppErrorOptions {
  severity?: ErrorSeverity;
  metadata?: Record<string, unknown>;
  isOperational?: boolean;
}

export class AppError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly metadata: Record<string, unknown>;
  public readonly isOperational: boolean;
  public readonly timestamp: string;

  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    options: AppErrorOptions = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.severity = options.severity ?? (statusCode >= 500 ? 'error' : 'warning');
    this.metadata = options.metadata ?? {};
    this.isOperational = options.isOperational ?? true;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      severity: this.severity,
      timestamp: this.timestamp,
    };
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string, options?: AppErrorOptions) {
    super(code, message, 401, { severity: 'warning', ...options });
    this.name = 'AuthError';
  }
}

export class SessionError extends AppError {
  constructor(code: string, message: string, statusCode: number = 400, options?: AppErrorOptions) {
    super(code, message, statusCode, { severity: 'warning', ...options });
    this.name = 'SessionError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(ErrorCodes.VALIDATION_ERROR, message, 400, {
      severity: 'warning',
      metadata,
    });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const msg = identifier
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`;
    super(ErrorCodes.NOT_FOUND, msg, 404, { severity: 'warning' });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(ErrorCodes.CONFLICT, message, 409, { severity: 'warning' });
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(ErrorCodes.RATE_LIMIT_EXCEEDED, message, 429, { severity: 'warning' });
    this.name = 'RateLimitError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(ErrorCodes.INTERNAL_EXTERNAL_SERVICE, `${service}: ${message}`, 502, {
      severity: 'error',
      metadata: { service },
    });
    this.name = 'ExternalServiceError';
  }
}
