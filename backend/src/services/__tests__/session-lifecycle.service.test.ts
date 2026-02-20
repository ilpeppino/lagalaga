import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabaseMock: any = null;

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabaseMock,
}));

const { SessionLifecycleService: SessionLifecycleServiceClass } = await import('../session-lifecycle.service.js');

function buildSupabaseMock(params: {
  staleActiveIds: string[];
  staleCompletedIds: string[];
  failActiveLookup?: boolean;
}) {
  const updateCalls: Array<Record<string, unknown>> = [];
  let selectInvocation = 0;

  const sessionsTable = {
    select: jest.fn(() => ({
      eq: jest.fn((_column: string, status: string) => {
        if (status === 'active') {
          return {
            or: jest.fn(() => ({
              limit: async () => {
                if (params.failActiveLookup) {
                  return {
                    data: null,
                    error: { message: 'active lookup failed' },
                  };
                }

                selectInvocation += 1;
                return {
                  data: params.staleActiveIds.map((id) => ({ id })),
                  error: null,
                };
              },
            })),
          };
        }

        return {
          lte: jest.fn(() => ({
            limit: async () => {
              selectInvocation += 1;
              return {
                data: params.staleCompletedIds.map((id) => ({ id })),
                error: null,
              };
            },
          })),
          is: jest.fn(() => ({
            lte: jest.fn(() => ({
              limit: async () => {
                selectInvocation += 1;
                return {
                  data: params.staleCompletedIds.map((id) => ({ id })),
                  error: null,
                };
              },
            })),
          })),
        };
      }),
    })),
    update: jest.fn((payload: Record<string, unknown>) => ({
      in: jest.fn((_column: string, ids: string[]) => ({
        eq: jest.fn((_statusColumn: string, _statusValue: string) => ({
          is: jest.fn(() => ({
            select: async () => {
              updateCalls.push({ payload, ids });
              return {
                data: ids.map((id) => ({ id })),
                error: null,
              };
            },
          })),
          select: async () => {
            updateCalls.push({ payload, ids });
            return {
              data: ids.map((id) => ({ id })),
              error: null,
            };
          },
        })),
      })),
    })),
  };

  return {
    from: jest.fn((table: string) => {
      if (table !== 'sessions') {
        throw new Error(`Unexpected table ${table}`);
      }
      return sessionsTable;
    }),
    updateCalls,
    getSelectInvocationCount: () => selectInvocation,
  };
}

describe('SessionLifecycleService', () => {
  beforeEach(() => {
    activeSupabaseMock = null;
  });

  it('auto-completes stale active sessions and archives old completed sessions', async () => {
    const supabaseMock = buildSupabaseMock({
      staleActiveIds: ['a1', 'a2'],
      staleCompletedIds: ['c1'],
    });
    activeSupabaseMock = supabaseMock;

    const service = new SessionLifecycleServiceClass({
      autoCompleteAfterHours: 2,
      completedRetentionHours: 2,
      batchSize: 50,
    });

    const result = await service.processLifecycle(new Date('2026-02-20T20:00:00.000Z'));

    expect(result.autoCompletedCount).toBe(2);
    expect(result.archivedCompletedCount).toBe(1);
    expect(supabaseMock.getSelectInvocationCount()).toBe(2);
    expect(supabaseMock.updateCalls).toHaveLength(2);
    expect(supabaseMock.updateCalls[0]).toMatchObject({
      payload: expect.objectContaining({ status: 'completed' }),
      ids: ['a1', 'a2'],
    });
    expect(supabaseMock.updateCalls[1]).toMatchObject({
      payload: expect.objectContaining({ archived_at: expect.any(String) }),
      ids: ['c1'],
    });
  });

  it('throws an operational app error when stale active lookup fails', async () => {
    activeSupabaseMock = buildSupabaseMock({
      staleActiveIds: [],
      staleCompletedIds: [],
      failActiveLookup: true,
    });

    const service = new SessionLifecycleServiceClass();

    await expect(service.processLifecycle()).rejects.toMatchObject({
      code: 'INT_002',
      statusCode: 500,
    });
  });
});
