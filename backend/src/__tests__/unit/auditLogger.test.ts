import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../config/supabase.js', () => ({
  getSupabase: jest.fn(),
}));

jest.mock('../../lib/logger.js', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

// Speed up retries in tests
jest.mock('../../lib/errorRecovery.js', () => ({
  withRetry: jest.fn(async (fn: () => Promise<unknown>, _opts?: unknown) => fn()),
}));

jest.mock('../../plugins/metrics.js', () => ({
  metrics: { incrementCounter: jest.fn() },
}));

import { getSupabase } from '../../config/supabase.js';
import { logger } from '../../lib/logger.js';
import { withRetry } from '../../lib/errorRecovery.js';
import { metrics } from '../../plugins/metrics.js';
import { logAuditEvent } from '../../services/auditLogger.js';

const mockGetSupabase = getSupabase as jest.MockedFunction<any>;
const mockLoggerError = logger.error as jest.MockedFunction<typeof logger.error>;
const mockWithRetry = withRetry as jest.MockedFunction<any>;
const mockIncrementCounter = metrics.incrementCounter as jest.MockedFunction<typeof metrics.incrementCounter>;

function makeEntry() {
  return {
    actor_id: 'user-123',
    action: 'account.delete_requested',
    outcome: 'success' as const,
  };
}

describe('logAuditEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: withRetry just calls the function once (no real retry delays)
    mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  });

  it('does not log or increment metric on successful insert', async () => {
    mockGetSupabase.mockReturnValue({
      from: () => ({ insert: async () => ({ error: null }) }),
    });

    await logAuditEvent(makeEntry());

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockIncrementCounter).not.toHaveBeenCalled();
  });

  it('retries via withRetry when insert fails', async () => {
    mockGetSupabase.mockReturnValue({
      from: () => ({ insert: async () => ({ error: { message: 'connection timeout' } }) }),
    });
    // Simulate withRetry exhausting attempts and re-throwing
    mockWithRetry.mockRejectedValue(new Error('connection timeout'));

    await logAuditEvent(makeEntry());

    expect(mockWithRetry).toHaveBeenCalledTimes(1);
    expect(mockWithRetry).toHaveBeenCalledWith(expect.any(Function), {
      maxAttempts: 3,
      baseDelayMs: 200,
    });
  });

  it('increments metric and logs structured error after all retries exhausted', async () => {
    mockWithRetry.mockRejectedValue(new Error('db unavailable'));

    const entry = makeEntry();
    await logAuditEvent(entry);

    expect(mockIncrementCounter).toHaveBeenCalledWith('audit_log_failures_total', {
      action: entry.action,
    });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const [context, message] = mockLoggerError.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('Audit log insert failed after retries');
    expect(context.error).toBe('db unavailable');
    expect(context.entry).toBe(entry);
  });

  it('never throws — audit failure must not block calling operations', async () => {
    mockWithRetry.mockRejectedValue(new Error('persistent failure'));

    await expect(logAuditEvent(makeEntry())).resolves.toBeUndefined();
  });
});
