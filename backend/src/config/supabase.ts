/**
 * Epic 7: Supabase Client Configuration
 *
 * Provides both service role and user-scoped Supabase clients:
 * - Service client: Bypasses RLS, used for backend operations
 * - User client: Enforces RLS, used for user-scoped operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';

let supabaseClient: SupabaseClient | null = null;
let supabaseUrl: string | null = null;
let supabaseAnonKey: string | null = null;

/**
 * Initialize the service role Supabase client (bypasses RLS)
 * This client should be used for all backend operations that require
 * privileged access (creating sessions, managing participants, etc.)
 */
export function initSupabase(fastify: FastifyInstance): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  // Store config for user client creation
  supabaseUrl = fastify.config.SUPABASE_URL;
  // Use validated config instead of reading process.env directly
  supabaseAnonKey = fastify.config.SUPABASE_ANON_KEY || null;

  supabaseClient = createClient(
    fastify.config.SUPABASE_URL,
    fastify.config.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return supabaseClient;
}

/**
 * Get the service role Supabase client (bypasses RLS)
 * Use this for backend operations that require privileged access
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized');
  }
  return supabaseClient;
}

/**
 * Create a user-scoped Supabase client (enforces RLS)
 * Use this for operations that should be scoped to a specific user's permissions
 *
 * @param accessToken - The user's JWT access token
 * @returns A Supabase client with RLS enforced for the given user
 *
 * @example
 * const userClient = getUserScopedClient(req.user.accessToken);
 * const { data } = await userClient.from('sessions').select('*');
 * // Only returns sessions the user has permission to view
 */
export function getUserScopedClient(accessToken: string): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase not initialized or SUPABASE_ANON_KEY not configured. ' +
      'Add SUPABASE_ANON_KEY to .env for user-scoped operations.'
    );
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  return client;
}

/**
 * Alias for getSupabase() - service role client
 * Use this for clarity when you specifically need service role access
 */
export function getServiceClient(): SupabaseClient {
  return getSupabase();
}

/**
 * Returns a set of query helpers pre-scoped to a single user's rows.
 *
 * Because the backend uses the service-role client (which bypasses RLS),
 * every query on user-owned tables must include an explicit ownership filter.
 * This helper makes that contract hard to miss and easy to audit.
 *
 * Usage:
 *   const { data } = await userScopedFrom('user_platforms', userId)
 *     .select('platform_user_id, platform_id')
 *     .eq('platform_id', 'roblox')
 *     .maybeSingle();
 *
 *   await userScopedFrom('user_platforms', userId)
 *     .update({ roblox_access_token_enc: newEnc });
 *
 * Do NOT use this for admin/service-level operations that legitimately need
 * cross-user access — use getSupabase().from(table) directly with a comment.
 */
export function userScopedFrom(table: string, userId: string) {
  if (!userId) {
    throw new Error(`userScopedFrom('${table}'): userId must not be empty`);
  }
  const db = getSupabase();
  return {
    select: (columns?: string) =>
      db.from(table).select(columns).eq('user_id', userId),
    update: (values: Record<string, unknown>) =>
      db.from(table).update(values).eq('user_id', userId),
    delete: () =>
      db.from(table).delete().eq('user_id', userId),
  };
}
