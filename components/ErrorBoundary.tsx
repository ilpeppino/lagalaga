/**
 * React Error Boundary
 *
 * Catches unhandled errors in the component tree.
 * Logs to MonitoringService and shows an ErrorFallback.
 */

import React from 'react';
import { monitoring } from '@/src/lib/monitoring';
import { logger } from '@/src/lib/logger';
import { ErrorFallback } from './ErrorFallback';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 'screen' fills the viewport, 'section' is compact. */
  level?: 'screen' | 'section';
  /** Custom fallback to render instead of the default ErrorFallback. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.fatal('Unhandled error caught by ErrorBoundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    monitoring.captureError(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          title="Something went wrong"
          message={this.state.error?.message || 'An unexpected error occurred.'}
          onRetry={this.handleRetry}
          showGoHome={this.props.level === 'screen'}
          level={this.props.level || 'screen'}
        />
      );
    }

    return this.props.children;
  }
}
