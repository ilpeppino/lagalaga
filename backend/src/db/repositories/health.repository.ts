import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

export interface HealthRepository {
  ping(): Promise<DbResult<boolean>>;
}

export class SupabaseHealthRepository implements HealthRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async ping(): Promise<DbResult<boolean>> {
    const { error } = await this.supabase.from('sessions').select('id').limit(1);
    if (error) {
      const dbError: DbError = {
        code: error.code ?? 'SUPABASE_QUERY_ERROR',
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      };
      return { data: null, error: dbError };
    }

    return { data: true, error: null };
  }
}

export class PgHealthRepository implements HealthRepository {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<DbResult<boolean>> {
    try {
      await this.pool.query('SELECT id FROM sessions LIMIT 1');
      return { data: true, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
