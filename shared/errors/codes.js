/**
 * Shared Error Codes, Severity, and Category types.
 * Imported by both frontend and backend.
 */
export const ErrorCodes = {
    // Auth errors
    AUTH_INVALID_CREDENTIALS: 'AUTH_001',
    AUTH_TOKEN_EXPIRED: 'AUTH_002',
    AUTH_INVALID_STATE: 'AUTH_003',
    AUTH_OAUTH_FAILED: 'AUTH_004',
    AUTH_UNAUTHORIZED: 'AUTH_005',
    AUTH_FORBIDDEN: 'AUTH_006',
    AUTH_TOKEN_REVOKED: 'AUTH_007',
    // Session errors
    SESSION_NOT_FOUND: 'SESSION_001',
    SESSION_FULL: 'SESSION_002',
    SESSION_ALREADY_JOINED: 'SESSION_003',
    SESSION_NOT_ACTIVE: 'SESSION_004',
    SESSION_CREATE_FAILED: 'SESSION_005',
    // Validation errors
    VALIDATION_ERROR: 'VAL_001',
    VALIDATION_MISSING_FIELDS: 'VAL_002',
    VALIDATION_INVALID_FORMAT: 'VAL_003',
    // Network errors (frontend-only concept but shared code)
    NETWORK_OFFLINE: 'NET_001',
    NETWORK_TIMEOUT: 'NET_002',
    NETWORK_REQUEST_FAILED: 'NET_003',
    // Not found errors
    NOT_FOUND: 'NOT_FOUND_001',
    NOT_FOUND_INVITE: 'NOT_FOUND_002',
    NOT_FOUND_USER: 'NOT_FOUND_003',
    // Rate limiting
    RATE_LIMIT_EXCEEDED: 'RATE_001',
    // Internal errors
    INTERNAL_ERROR: 'INT_001',
    INTERNAL_DB_ERROR: 'INT_002',
    INTERNAL_EXTERNAL_SERVICE: 'INT_003',
    // Conflict
    CONFLICT: 'CONFLICT_001',
    // Legacy codes (kept for backward compatibility)
    FORBIDDEN: 'AUTH_006',
    BAD_REQUEST: 'VAL_001',
};
export function getErrorCategory(code) {
    if (code.startsWith('AUTH_'))
        return 'auth';
    if (code.startsWith('SESSION_'))
        return 'session';
    if (code.startsWith('VAL_'))
        return 'validation';
    if (code.startsWith('NET_'))
        return 'network';
    if (code.startsWith('NOT_FOUND'))
        return 'not_found';
    if (code.startsWith('RATE_'))
        return 'rate_limit';
    if (code.startsWith('CONFLICT'))
        return 'conflict';
    return 'internal';
}
//# sourceMappingURL=codes.js.map