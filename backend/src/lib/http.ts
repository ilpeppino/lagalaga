export interface FetchWithTimeoutAndRetryOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 1;

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || error.name === 'TypeError';
}

export async function fetchWithTimeoutAndRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithTimeoutAndRetryOptions = {}
): Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;

      if (!isNetworkError(error) || attempt === retries) {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('HTTP request failed');
}
