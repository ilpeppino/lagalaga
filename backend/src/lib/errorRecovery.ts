/**
 * Error Recovery Utilities
 *
 * - withRetry: Exponential backoff for transient failures
 * - CircuitBreaker: Protects against cascading failures from external services
 */

import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return true if the error is retryable. Defaults to always true. */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Retry a function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    isRetryable = () => true,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxAttempts || !isRetryable(lastError)) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = delay * 0.1 * Math.random();
      const totalDelay = Math.round(delay + jitter);

      logger.warn(
        { attempt, maxAttempts, delayMs: totalDelay, error: lastError.message },
        `Retry attempt ${attempt}/${maxAttempts} after ${totalDelay}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }
  }

  throw lastError;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit. Default: 5. */
  failureThreshold?: number;
  /** Time in ms before moving from open to half-open. Default: 30000. */
  resetTimeoutMs?: number;
  /** Name for logging. */
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.name = options.name ?? 'CircuitBreaker';
  }

  getState(): CircuitState {
    if (this.state === 'open') {
      // Check if reset timeout has elapsed
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half-open';
        logger.info({ circuitBreaker: this.name }, `Circuit ${this.name} moved to half-open`);
      }
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'open') {
      throw new Error(`Circuit ${this.name} is open — request rejected`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      logger.info({ circuitBreaker: this.name }, `Circuit ${this.name} closed`);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      logger.error(
        { circuitBreaker: this.name, failureCount: this.failureCount },
        `Circuit ${this.name} opened after ${this.failureCount} failures`
      );
    }
  }
}
