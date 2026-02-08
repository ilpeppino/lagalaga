/**
 * useErrorHandler hook
 *
 * Standardizes error handling in catch blocks.
 * Replaces scattered console.error + Alert.alert pattern.
 */

import { useCallback } from 'react';
import { presentError, getUserMessage } from '@/src/lib/errorPresenter';
import { monitoring } from '@/src/lib/monitoring';

interface ErrorHandlerOptions {
  /** If true, don't show an alert for critical errors. */
  silent?: boolean;
  /** Fallback message when error has no useful text. */
  fallbackMessage?: string;
}

interface ErrorHandler {
  /**
   * Handle an error: log it, optionally alert the user, and return a user message.
   */
  handleError: (error: unknown, options?: ErrorHandlerOptions) => string;

  /**
   * Get a user-friendly message for an error without triggering alerts.
   */
  getErrorMessage: (error: unknown, fallback?: string) => string;
}

export function useErrorHandler(): ErrorHandler {
  const handleError = useCallback((error: unknown, options?: ErrorHandlerOptions): string => {
    // Report to monitoring
    monitoring.captureError(
      error instanceof Error ? error : new Error(String(error))
    );

    // Present to user (logs + optional alert)
    return presentError(error, {
      silent: options?.silent,
      fallbackMessage: options?.fallbackMessage,
    });
  }, []);

  const getErrorMessage = useCallback((error: unknown, fallback?: string): string => {
    return getUserMessage(error, fallback);
  }, []);

  return { handleError, getErrorMessage };
}
