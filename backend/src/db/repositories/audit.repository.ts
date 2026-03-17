import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export interface AuditLogEntry {
  actor_id: string | null;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  outcome: 'success' | 'failure';
  error_message?: string;
}

export interface AuditRepository {
  insert(entry: AuditLogEntry): Promise<DbResult<void>>;
}

export class SupabaseAuditRepository implements AuditRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async insert(entry: AuditLogEntry): Promise<DbResult<void>> {
    const { error } = await this.supabase.from('audit_logs').insert([
      {
        actor_id: entry.actor_id,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        metadata: entry.metadata,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        outcome: entry.outcome,
        error_message: entry.error_message,
      },
    ]);

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: undefined, error: null };
  }
}

export class PgAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async insert(entry: AuditLogEntry): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `INSERT INTO audit_logs (
          actor_id,
          action,
          resource_type,
          resource_id,
          metadata,
          ip_address,
          user_agent,
          outcome,
          error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.actor_id,
          entry.action,
          entry.resource_type ?? null,
          entry.resource_id ?? null,
          entry.metadata ?? null,
          entry.ip_address ?? null,
          entry.user_agent ?? null,
          entry.outcome,
          entry.error_message ?? null,
        ]
      );

      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
