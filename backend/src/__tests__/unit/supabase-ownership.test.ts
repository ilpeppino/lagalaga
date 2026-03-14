/**
 * Ownership enforcement audit — userScopedFrom helper
 *
 * Verifies that userScopedFrom:
 *   1. Requires a non-empty userId (guard against unscoped queries)
 *   2. Pre-applies .eq('user_id', userId) on select, update, and delete
 *   3. Cannot be used to access another user's data by construction
 */
import { describe, it, expect, jest } from '@jest/globals';
import { userScopedFrom } from '../../config/supabase.js';

// ---------------------------------------------------------------------------
// Minimal fake Supabase client — captures .eq() calls for assertion
// ---------------------------------------------------------------------------

type EqCapture = { column: string; value: unknown };

function makeClient() {
  const eqCalls: EqCapture[] = [];

  function makeEq() {
    const eq = jest.fn((column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return { eq, maybeSingle: jest.fn(), single: jest.fn() };
    });
    return eq;
  }

  const selectEq = makeEq();
  const updateEq = makeEq();
  const deleteEq = makeEq();

  const selectFn = jest.fn((_cols?: string) => ({ eq: selectEq, maybeSingle: jest.fn() }));
  const updateFn = jest.fn((_vals: Record<string, unknown>) => ({ eq: updateEq }));
  const deleteFn = jest.fn(() => ({ eq: deleteEq }));

  const fromFn = jest.fn((_table: string) => ({
    select: selectFn,
    update: updateFn,
    delete: deleteFn,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { from: fromFn } as any;

  return { client, fromFn, selectFn, updateFn, deleteFn, eqCalls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('userScopedFrom — ownership guard', () => {
  it('throws when userId is empty string', () => {
    const { client } = makeClient();
    expect(() => userScopedFrom('user_platforms', '', client)).toThrow(
      "userScopedFrom('user_platforms'): userId must not be empty"
    );
  });

  it('select() applies .eq("user_id", userId) before returning', () => {
    const userId = 'user-abc-123';
    const { client, fromFn, selectFn, eqCalls } = makeClient();

    userScopedFrom('user_platforms', userId, client).select('platform_user_id');

    expect(fromFn).toHaveBeenCalledWith('user_platforms');
    expect(selectFn).toHaveBeenCalledWith('platform_user_id');
    expect(eqCalls[0]).toEqual({ column: 'user_id', value: userId });
  });

  it('update() applies .eq("user_id", userId) before returning', () => {
    const userId = 'user-xyz-456';
    const { client, updateFn, eqCalls } = makeClient();

    userScopedFrom('user_platforms', userId, client).update({ roblox_access_token_enc: 'new-enc' });

    expect(updateFn).toHaveBeenCalledWith({ roblox_access_token_enc: 'new-enc' });
    expect(eqCalls[0]).toEqual({ column: 'user_id', value: userId });
  });

  it('delete() applies .eq("user_id", userId) before returning', () => {
    const userId = 'user-del-789';
    const { client, deleteFn, eqCalls } = makeClient();

    userScopedFrom('user_platforms', userId, client).delete();

    expect(deleteFn).toHaveBeenCalled();
    expect(eqCalls[0]).toEqual({ column: 'user_id', value: userId });
  });

  it('cannot access another user\'s rows by construction', () => {
    const requestingUser = 'user-a';
    const otherUser = 'user-b';
    const { client, eqCalls } = makeClient();

    userScopedFrom('user_platforms', requestingUser, client).select('*');

    const ownershipFilter = eqCalls.find((c) => c.column === 'user_id');
    expect(ownershipFilter?.value).toBe(requestingUser);
    expect(ownershipFilter?.value).not.toBe(otherUser);
  });
});
