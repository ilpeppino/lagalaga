import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface FriendshipRow {
  id: string;
  user_id: string;
  friend_id: string;
  status: FriendshipStatus;
  initiated_by: string;
  created_at: string;
  accepted_at: string | null;
}

export interface UserProfileRow {
  id: string;
  roblox_user_id: string;
  roblox_username: string | null;
  roblox_display_name: string | null;
  avatar_headshot_url: string | null;
}

export interface RobloxFriendsCacheRow {
  roblox_friend_user_id: string;
  roblox_friend_username: string | null;
  roblox_friend_display_name: string | null;
  synced_at: string | null;
}

export interface FriendshipRepository {
  listForUser(userId: string): Promise<DbResult<FriendshipRow[]>>;
  listProfilesByIds(userIds: string[]): Promise<DbResult<UserProfileRow[]>>;
  listRobloxCacheByUserId(userId: string): Promise<DbResult<RobloxFriendsCacheRow[]>>;
  listProfilesByRobloxIds(robloxIds: string[]): Promise<DbResult<UserProfileRow[]>>;
  findUserById(userId: string): Promise<DbResult<{ id: string } | null>>;
  findByPair(userId: string, friendId: string): Promise<DbResult<Pick<FriendshipRow, 'id' | 'status'> | null>>;
  insert(input: {
    userId: string;
    friendId: string;
    status: FriendshipStatus;
    initiatedBy: string;
  }): Promise<DbResult<Pick<FriendshipRow, 'id' | 'status'>>>;
  findById(friendshipId: string): Promise<DbResult<Pick<FriendshipRow, 'id' | 'user_id' | 'friend_id' | 'status' | 'initiated_by'> | null>>;
  updateStatus(friendshipId: string, status: FriendshipStatus, acceptedAt?: string): Promise<DbResult<void>>;
  deleteById(friendshipId: string): Promise<DbResult<void>>;
  findAcceptedByPair(userId: string, friendId: string): Promise<DbResult<{ id: string } | null>>;
}

export class SupabaseFriendshipRepository implements FriendshipRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async listForUser(userId: string): Promise<DbResult<FriendshipRow[]>> {
    const { data, error } = await this.supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, initiated_by, created_at, accepted_at')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: (data ?? []) as FriendshipRow[], error: null };
  }

  async listProfilesByIds(userIds: string[]): Promise<DbResult<UserProfileRow[]>> {
    if (userIds.length === 0) return { data: [], error: null };

    const { data, error } = await this.supabase
      .from('app_users')
      .select('id, roblox_user_id, roblox_username, roblox_display_name, avatar_headshot_url')
      .in('id', userIds);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: (data ?? []) as UserProfileRow[], error: null };
  }

  async listRobloxCacheByUserId(userId: string): Promise<DbResult<RobloxFriendsCacheRow[]>> {
    const { data, error } = await this.supabase
      .from('roblox_friends_cache')
      .select('roblox_friend_user_id, roblox_friend_username, roblox_friend_display_name, synced_at')
      .eq('user_id', userId)
      .order('synced_at', { ascending: false });

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: (data ?? []) as RobloxFriendsCacheRow[], error: null };
  }

  async listProfilesByRobloxIds(robloxIds: string[]): Promise<DbResult<UserProfileRow[]>> {
    if (robloxIds.length === 0) return { data: [], error: null };

    const { data, error } = await this.supabase
      .from('app_users')
      .select('id, roblox_user_id, roblox_username, roblox_display_name, avatar_headshot_url')
      .in('roblox_user_id', robloxIds);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: (data ?? []) as UserProfileRow[], error: null };
  }

  async findUserById(userId: string): Promise<DbResult<{ id: string } | null>> {
    const { data, error } = await this.supabase
      .from('app_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle<{ id: string }>();

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: data ?? null, error: null };
  }

  async findByPair(userId: string, friendId: string): Promise<DbResult<Pick<FriendshipRow, 'id' | 'status'> | null>> {
    const { data, error } = await this.supabase
      .from('friendships')
      .select('id, status')
      .eq('user_id', userId)
      .eq('friend_id', friendId)
      .maybeSingle<Pick<FriendshipRow, 'id' | 'status'>>();

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: data ?? null, error: null };
  }

  async insert(input: {
    userId: string;
    friendId: string;
    status: FriendshipStatus;
    initiatedBy: string;
  }): Promise<DbResult<Pick<FriendshipRow, 'id' | 'status'>>> {
    const { data, error } = await this.supabase
      .from('friendships')
      .insert({
        user_id: input.userId,
        friend_id: input.friendId,
        status: input.status,
        initiated_by: input.initiatedBy,
      })
      .select('id, status')
      .single<Pick<FriendshipRow, 'id' | 'status'>>();

    if (error || !data) {
      return { data: null, error: { code: error?.code ?? 'SUPABASE_QUERY_ERROR', message: error?.message ?? 'Insert failed' } };
    }

    return { data, error: null };
  }

  async findById(friendshipId: string): Promise<DbResult<Pick<FriendshipRow, 'id' | 'user_id' | 'friend_id' | 'status' | 'initiated_by'> | null>> {
    const { data, error } = await this.supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, initiated_by')
      .eq('id', friendshipId)
      .maybeSingle<Pick<FriendshipRow, 'id' | 'user_id' | 'friend_id' | 'status' | 'initiated_by'>>();

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: data ?? null, error: null };
  }

  async updateStatus(friendshipId: string, status: FriendshipStatus, acceptedAt?: string): Promise<DbResult<void>> {
    const payload: Record<string, unknown> = { status };
    if (acceptedAt) {
      payload.accepted_at = acceptedAt;
      payload.updated_at = acceptedAt;
    }

    const { error } = await this.supabase
      .from('friendships')
      .update(payload)
      .eq('id', friendshipId);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: undefined, error: null };
  }

  async deleteById(friendshipId: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: undefined, error: null };
  }

  async findAcceptedByPair(userId: string, friendId: string): Promise<DbResult<{ id: string } | null>> {
    const { data, error } = await this.supabase
      .from('friendships')
      .select('id')
      .eq('user_id', userId)
      .eq('friend_id', friendId)
      .eq('status', 'accepted')
      .maybeSingle<{ id: string }>();

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: data ?? null, error: null };
  }
}

export class PgFriendshipRepository implements FriendshipRepository {
  constructor(private readonly pool: Pool) {}

  async listForUser(userId: string): Promise<DbResult<FriendshipRow[]>> {
    try {
      const result = await this.pool.query<FriendshipRow>(
        `SELECT id::text, user_id::text, friend_id::text, status, initiated_by::text, created_at::text, accepted_at::text
         FROM friendships
         WHERE user_id = $1 OR friend_id = $1`,
        [userId]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listProfilesByIds(userIds: string[]): Promise<DbResult<UserProfileRow[]>> {
    if (userIds.length === 0) return { data: [], error: null };

    try {
      const result = await this.pool.query<UserProfileRow>(
        `SELECT id::text, roblox_user_id, roblox_username, roblox_display_name, avatar_headshot_url
         FROM app_users
         WHERE id = ANY($1::uuid[])`,
        [userIds]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listRobloxCacheByUserId(userId: string): Promise<DbResult<RobloxFriendsCacheRow[]>> {
    try {
      const result = await this.pool.query<RobloxFriendsCacheRow>(
        `SELECT roblox_friend_user_id, roblox_friend_username, roblox_friend_display_name, synced_at::text
         FROM roblox_friends_cache
         WHERE user_id = $1
         ORDER BY synced_at DESC`,
        [userId]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listProfilesByRobloxIds(robloxIds: string[]): Promise<DbResult<UserProfileRow[]>> {
    if (robloxIds.length === 0) return { data: [], error: null };

    try {
      const result = await this.pool.query<UserProfileRow>(
        `SELECT id::text, roblox_user_id, roblox_username, roblox_display_name, avatar_headshot_url
         FROM app_users
         WHERE roblox_user_id = ANY($1::text[])`,
        [robloxIds]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findUserById(userId: string): Promise<DbResult<{ id: string } | null>> {
    try {
      const result = await this.pool.query<{ id: string }>('SELECT id::text FROM app_users WHERE id = $1 LIMIT 1', [userId]);
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findByPair(userId: string, friendId: string): Promise<DbResult<Pick<FriendshipRow, 'id' | 'status'> | null>> {
    try {
      const result = await this.pool.query<Pick<FriendshipRow, 'id' | 'status'>>(
        `SELECT id::text, status
         FROM friendships
         WHERE user_id = $1 AND friend_id = $2
         LIMIT 1`,
        [userId, friendId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async insert(input: {
    userId: string;
    friendId: string;
    status: FriendshipStatus;
    initiatedBy: string;
  }): Promise<DbResult<Pick<FriendshipRow, 'id' | 'status'>>> {
    try {
      const result = await this.pool.query<Pick<FriendshipRow, 'id' | 'status'>>(
        `INSERT INTO friendships (user_id, friend_id, status, initiated_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text, status`,
        [input.userId, input.friendId, input.status, input.initiatedBy]
      );
      return { data: result.rows[0], error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findById(friendshipId: string): Promise<DbResult<Pick<FriendshipRow, 'id' | 'user_id' | 'friend_id' | 'status' | 'initiated_by'> | null>> {
    try {
      const result = await this.pool.query<Pick<FriendshipRow, 'id' | 'user_id' | 'friend_id' | 'status' | 'initiated_by'>>(
        `SELECT id::text, user_id::text, friend_id::text, status, initiated_by::text
         FROM friendships
         WHERE id = $1
         LIMIT 1`,
        [friendshipId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async updateStatus(friendshipId: string, status: FriendshipStatus, acceptedAt?: string): Promise<DbResult<void>> {
    try {
      if (acceptedAt) {
        await this.pool.query(
          `UPDATE friendships
           SET status = $2, accepted_at = $3, updated_at = $3
           WHERE id = $1`,
          [friendshipId, status, acceptedAt]
        );
      } else {
        await this.pool.query(
          `UPDATE friendships
           SET status = $2
           WHERE id = $1`,
          [friendshipId, status]
        );
      }
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async deleteById(friendshipId: string): Promise<DbResult<void>> {
    try {
      await this.pool.query('DELETE FROM friendships WHERE id = $1', [friendshipId]);
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findAcceptedByPair(userId: string, friendId: string): Promise<DbResult<{ id: string } | null>> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `SELECT id::text
         FROM friendships
         WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'
         LIMIT 1`,
        [userId, friendId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
