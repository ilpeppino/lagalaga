export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 401);
    this.name = 'AuthError';
  }
}

export class SessionError extends AppError {
  constructor(code: string, message: string, statusCode: number = 400) {
    super(code, message, statusCode);
    this.name = 'SessionError';
  }
}

export const ErrorCodes = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_TOKEN_EXPIRED: 'AUTH_002',
  AUTH_INVALID_STATE: 'AUTH_003',
  AUTH_OAUTH_FAILED: 'AUTH_004',
  SESSION_NOT_FOUND: 'SESSION_001',
  SESSION_FULL: 'SESSION_002',
  VALIDATION_ERROR: 'VAL_001',
  INTERNAL_ERROR: 'INT_001',
} as const;
