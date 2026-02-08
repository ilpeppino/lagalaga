/**
 * Error Presenter
 *
 * Maps error types to user-facing messages.
 * Critical errors → Alert.alert(), warnings → inline, info → silent log.
 */

import { Alert } from 'react-native';
import { ApiError, NetworkError, isApiError, isNetworkError } from './errors';
import { logger } from './logger';

interface PresentOptions {
  /** Fallback message if no mapping is found. */
  fallbackMessage?: string;
  /** Skip showing alert even for critical errors. */
  silent?: boolean;
}

/** Well-known error code → user-friendly message mapping. */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  AUTH_001: 'Invalid credentials. Please try again.',
  AUTH_002: 'Your session has expired. Please sign in again.',
  AUTH_003: 'Authentication error. Please try signing in again.',
  AUTH_004: 'Failed to sign in with Roblox. Please try again.',
  AUTH_005: 'You are not authorized. Please sign in.',
  AUTH_006: 'You do not have permission for this action.',
  AUTH_007: 'Your session was revoked. Please sign in again.',
  SESSION_001: 'Session not found.',
  SESSION_002: 'This session is full.',
  SESSION_003: 'You have already joined this session.',
  SESSION_004: 'This session is no longer active.',
  SESSION_005: 'Failed to create session. Please try again.',
  VAL_001: 'Please check your input and try again.',
  VAL_002: 'Required fields are missing.',
  VAL_003: 'Invalid input format.',
  NET_001: 'You appear to be offline. Please check your connection.',
  NET_002: 'The request timed out. Please try again.',
  NET_003: 'Network error. Please check your connection and try again.',
  NOT_FOUND_001: 'The requested resource was not found.',
  NOT_FOUND_002: 'This invite link is not valid or has expired.',
  RATE_001: 'Too many requests. Please wait a moment and try again.',
  INT_001: 'Something went wrong. Please try again later.',
  CONFLICT_001: 'A conflict occurred. Please try again.',
};

/**
 * Get a user-friendly message for an error.
 */
export function getUserMessage(error: unknown, fallback?: string): string {
  if (isApiError(error)) {
    return ERROR_MESSAGE_MAP[error.code] || error.message || fallback || 'Something went wrong.';
  }
  if (isNetworkError(error)) {
    return ERROR_MESSAGE_MAP.NET_003;
  }
  if (error instanceof Error) {
    return error.message || fallback || 'Something went wrong.';
  }
  return fallback || 'Something went wrong.';
}

/**
 * Present an error to the user.
 *
 * - Logs the error via Logger
 * - For critical errors (5xx, fatal, network): shows Alert.alert()
 * - For warnings (4xx validation): returns message for inline display
 * - For info-level: logs silently
 */
export function presentError(error: unknown, options: PresentOptions = {}): string {
  const message = getUserMessage(error, options.fallbackMessage);

  // Always log
  if (isApiError(error)) {
    logger.error(`[${error.code}] ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
      requestId: error.requestId,
    });
  } else if (error instanceof Error) {
    logger.error(error.message, { stack: error.stack });
  } else {
    logger.error(String(error));
  }

  if (options.silent) {
    return message;
  }

  // Determine presentation strategy
  const shouldAlert = isCriticalError(error);

  if (shouldAlert) {
    Alert.alert('Error', message);
  }

  return message;
}

function isCriticalError(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (isApiError(error)) {
    return error.severity === 'fatal' || error.severity === 'error' || error.statusCode >= 500;
  }
  return true; // Unknown errors are treated as critical
}
