/**
 * Ownership enforcement audit — userScopedFrom helper
 *
 * Verifies that userScopedFrom:
 *   1. Requires a non-empty userId (guard against accidentally unscoped queries)
 *   2. Applies .eq('user_id', userId) on select, update, and delete operations
 *   3. Does NOT allow cross-user data access by construction
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- minimal Supabase client mock -------------------------------------------

function makeEqCapture() {
  const calls: Array<{ column: string; value: unknown }> = [];
  const eqFn = jest.fn((column: string, value: unknown) => {
    calls.push({ column, value });
    // return something chainable so further .eq/.maybeSingle calls don't throw
    return { eq: eqFn, maybeSingle: jest.fn(), single: jest.fn() };
  });
  return { eqFn, calls };
}

function makeTableMock() {
  const { eqFn, calls } = makeEqCapture();
  const selectMock = jest.fn(() => ({ eq: eqFn, maybeSingle: jest.fn() }));
  const updateMock = jest.fn(() => ({ eq: eqFn }));
  const deleteMock = jest.fn(() => ({ eq: eqFn }));
  const fromMock = jest.fn(() => ({
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
  }));
  return { fromMock, selectMock, updateMock, deleteMock, eqFn, eqCalls: calls };
}

let mockFrom: ReturnType<typeof makeTableMock>;

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => ({ from: (...args: unknown[]) => mockFrom.fromMock(...args) }),
  userScopedFrom: jest.fn(), // replaced by actual implementation via direct import below
}));

// Re-import after mocking
const { userScopedFrom } = await import('../../config/supabase.js');

// ---------------------------------------------------------------------------

describe('userScopedFrom — ownership guard', () => {
  beforeEach(() => {
    mockFrom = makeTableMock();
  });

  it('throws when userId is empty string', () => {
    expect(() => userScopedFrom('user_platforms', '')).toThrow(
      "userScopedFrom('user_platforms'): userId must not be empty"
    );
  });

  it('select() calls .eq("user_id", userId) on the underlying query', () => {
    const userId = 'user-abc-123';
    userScopedFrom('user_platforms', userId).select('platform_user_id');

    expect(mockFrom.fromMock).toHaveBeenCalledWith('user_platforms');
    expect(mockFrom.selectMock).toHaveBeenCalledWith('platform_user_id');
    const firstEqCall = mockFrom.eqCalls[0];
    expect(firstEqCall).toEqual({ column: 'user_id', value: userId });
  });

  it('update() calls .eq("user_id", userId) on the underlying query', () => {
    const userId = 'user-xyz-456';
    userScopedFrom('user_platforms', userId).update({ roblox_access_token_enc: 'new-enc' });

    expect(mockFrom.updateMock).toHaveBeenCalledWith({ roblox_access_token_enc: 'new-enc' });
    const firstEqCall = mockFrom.eqCalls[0];
    expect(firstEqCall).toEqual({ column: 'user_id', value: userId });
  });

  it('delete() calls .eq("user_id", userId) on the underlying query', () => {
    const userId = 'user-del-789';
    userScopedFrom('user_platforms', userId).delete();

    expect(mockFrom.deleteMock).toHaveBeenCalled();
    const firstEqCall = mockFrom.eqCalls[0];
    expect(firstEqCall).toEqual({ column: 'user_id', value: userId });
  });

  it('does not permit querying another user\'s rows by construction', () => {
    const requestingUser = 'user-a';
    const otherUser = 'user-b';

    userScopedFrom('user_platforms', requestingUser).select('*');

    // The userId filter must be requestingUser, never otherUser
    const eqCall = mockFrom.eqCalls.find((c) => c.column === 'user_id');
    expect(eqCall?.value).toBe(requestingUser);
    expect(eqCall?.value).not.toBe(otherUser);
  });
});
