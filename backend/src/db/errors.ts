import { ErrorCodes } from '../../../shared/errors/codes.js';
import type { DbError } from './types.js';

interface PgErrorLike {
  code?: string;
  message?: string;
  detail?: string;
}

const PG_ERROR_CODE_MAP: Record<string, string> = {
  // unique_violation
  '23505': ErrorCodes.CONFLICT,
  // foreign_key_violation
  '23503': ErrorCodes.VALIDATION_ERROR,
  // not_null_violation
  '23502': ErrorCodes.VALIDATION_MISSING_FIELDS,
  // check_violation
  '23514': ErrorCodes.VALIDATION_INVALID_FORMAT,
  // exclusion_violation
  '23P01': ErrorCodes.CONFLICT,
};

export function mapPgErrorCode(code?: string): string {
  if (!code) {
    return ErrorCodes.INTERNAL_DB_ERROR;
  }

  return PG_ERROR_CODE_MAP[code] ?? ErrorCodes.INTERNAL_DB_ERROR;
}

export function mapPgError(error: unknown): DbError {
  const pgError = (error ?? {}) as PgErrorLike;

  return {
    code: mapPgErrorCode(pgError.code),
    message: pgError.message ?? 'Database operation failed',
    ...(pgError.detail ? { details: pgError.detail } : {}),
  };
}
