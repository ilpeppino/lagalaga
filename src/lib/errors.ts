/**
 * Frontend Error Classes & API Error Parser
 *
 * - ApiError: typed error from backend responses
 * - NetworkError: fetch failures / connectivity
 * - parseApiError(): factory that parses the standard API envelope
 */

import type { ErrorSeverity } from '../../shared/errors/codes';

export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly severity: ErrorSeverity;
  public readonly requestId: string;
  public readonly metadata: Record<string, unknown>;

  constructor(opts: {
    code: string;
    message: string;
    statusCode: number;
    severity?: ErrorSeverity;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.severity = opts.severity ?? (opts.statusCode >= 500 ? 'error' : 'warning');
    this.requestId = opts.requestId ?? '';
    this.metadata = opts.metadata ?? {};
  }

  get isAuthError(): boolean {
    return this.code.startsWith('AUTH_') || this.statusCode === 401;
  }

  get isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  get isNetworkError(): boolean {
    return false; // Use NetworkError class for this
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

export class NetworkError extends Error {
  public readonly code = 'NET_003';
  public readonly statusCode = 0;
  public readonly severity: ErrorSeverity = 'error';

  constructor(message: string = 'Network request failed', public readonly cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }

  get isRetryable(): boolean {
    return true;
  }

  get isNetworkError(): boolean {
    return true;
  }
}

/**
 * Parse an HTTP response into an ApiError.
 * Handles the standard `{ success: false, error: { ... } }` envelope,
 * plus various fallback shapes the backend may return.
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  const status = response.status;
  let parsed: Record<string, unknown> | undefined;

  try {
    parsed = await response.clone().json();
  } catch {
    // Not JSON
  }

  const errorObj = (parsed as any)?.error;
  const code: string =
    errorObj?.code ??
    (parsed as any)?.code ??
    `HTTP_${status}`;
  const message: string =
    errorObj?.message ??
    (parsed as any)?.message ??
    (response.statusText || 'Request failed');
  const severity: ErrorSeverity =
    errorObj?.severity ??
    (status >= 500 ? 'error' : 'warning');
  const requestId: string =
    errorObj?.requestId ??
    response.headers.get('X-Request-ID') ??
    '';

  return new ApiError({ code, message, statusCode: status, severity, requestId });
}

/**
 * Type guard — is this an ApiError?
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard — is this a NetworkError?
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}
