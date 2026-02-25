import { ExternalServiceError } from '../utils/errors.js';
import { logger } from './logger.js';

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

export interface UpstreamFetchOptions extends FetchWithTimeoutRetryOptions {
  upstream: string;
  endpoint: string;
  requestId?: string;
}

export type UpstreamFetchResult =
  | { kind: 'ok'; response: Response }
  | { kind: 'rate_limited'; response: Response; retryAfterSec: number | null }
  | { kind: 'http_error'; response: Response }
  | { kind: 'network_error'; error: ExternalServiceError };

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

export function parseRetryAfterSec(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) {
    return null;
  }

  const deltaSec = Math.ceil((asDate - Date.now()) / 1000);
  return deltaSec > 0 ? deltaSec : 0;
}

export async function fetchUpstream(
  url: string,
  init: RequestInit = {},
  options: UpstreamFetchOptions
): Promise<UpstreamFetchResult> {
  const { upstream, endpoint, requestId, fetchFn, timeoutMs, retries, source } = options;

  let response: Response;
  try {
    response = await fetchWithTimeoutAndRetry(
      url,
      init,
      {
        fetchFn,
        timeoutMs,
        retries,
        source: source ?? `${upstream} ${endpoint}`,
      }
    );
  } catch (error) {
    const wrapped = error instanceof ExternalServiceError
      ? error
      : new ExternalServiceError(source ?? upstream, error instanceof Error ? error.message : String(error));

    return { kind: 'network_error', error: wrapped };
  }

  if (response.status === 429) {
    const retryAfterSec = parseRetryAfterSec(response.headers.get('retry-after'));
    logger.warn(
      {
        kind: 'upstream_rate_limit',
        upstream,
        endpoint,
        retryAfterSec,
        requestId,
      },
      'Upstream rate limited request'
    );
    return { kind: 'rate_limited', response, retryAfterSec };
  }

  if (!response.ok) {
    return { kind: 'http_error', response };
  }

  return { kind: 'ok', response };
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  const withCode = error as Error & { code?: unknown; cause?: { code?: unknown } };
  const code = typeof withCode.code === 'string'
    ? withCode.code.toUpperCase()
    : (typeof withCode.cause?.code === 'string' ? withCode.cause.code.toUpperCase() : '');
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('dns')
  );
}
