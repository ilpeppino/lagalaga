import { ExternalServiceError } from '../utils/errors.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchJsonWithTimeoutRetryOptions {
  fetchFn?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  init?: RequestInit;
  source?: string;
}

export interface FetchWithTimeoutRetryOptions {
  fetchFn?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  source?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 1;

export async function fetchJsonWithTimeoutRetry<T>(
  url: string,
  options: FetchJsonWithTimeoutRetryOptions = {}
): Promise<T> {
  const {
    fetchFn = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    init,
    source = 'External API',
  } = options;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    attempt += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ExternalServiceError(source, `HTTP ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableNetworkError(error);
      if (!retryable || attempt > retries) {
        if (error instanceof ExternalServiceError) {
          throw error;
        }
        if (error instanceof Error) {
          throw new ExternalServiceError(source, error.message);
        }
        throw new ExternalServiceError(source, 'Unknown request error');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ExternalServiceError(source, String(lastError));
}

export async function fetchWithTimeoutAndRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithTimeoutRetryOptions = {}
): Promise<Response> {
  const {
    fetchFn = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    source = 'External API',
  } = options;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    attempt += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      const retryable = isRetryableNetworkError(error);
      if (!retryable || attempt > retries) {
        if (error instanceof Error) {
          throw new ExternalServiceError(source, error.message);
        }
        throw new ExternalServiceError(source, 'Unknown request error');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ExternalServiceError(source, String(lastError));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('socket') ||
    message.includes('econn') ||
    message.includes('aborted')
  );
}
