/**
 * Shared Error Codes, Severity, and Category types.
 * Imported by both frontend and backend.
 */
export declare const ErrorCodes: {
    readonly AUTH_INVALID_CREDENTIALS: "AUTH_001";
    readonly AUTH_TOKEN_EXPIRED: "AUTH_002";
    readonly AUTH_INVALID_STATE: "AUTH_003";
    readonly AUTH_OAUTH_FAILED: "AUTH_004";
    readonly AUTH_UNAUTHORIZED: "AUTH_005";
    readonly AUTH_FORBIDDEN: "AUTH_006";
    readonly AUTH_TOKEN_REVOKED: "AUTH_007";
    readonly SESSION_NOT_FOUND: "SESSION_001";
    readonly SESSION_FULL: "SESSION_002";
    readonly SESSION_ALREADY_JOINED: "SESSION_003";
    readonly SESSION_NOT_ACTIVE: "SESSION_004";
    readonly SESSION_CREATE_FAILED: "SESSION_005";
    readonly VALIDATION_ERROR: "VAL_001";
    readonly VALIDATION_MISSING_FIELDS: "VAL_002";
    readonly VALIDATION_INVALID_FORMAT: "VAL_003";
    readonly NETWORK_OFFLINE: "NET_001";
    readonly NETWORK_TIMEOUT: "NET_002";
    readonly NETWORK_REQUEST_FAILED: "NET_003";
    readonly NOT_FOUND: "NOT_FOUND_001";
    readonly NOT_FOUND_INVITE: "NOT_FOUND_002";
    readonly NOT_FOUND_USER: "NOT_FOUND_003";
    readonly RATE_LIMIT_EXCEEDED: "RATE_001";
    readonly INTERNAL_ERROR: "INT_001";
    readonly INTERNAL_DB_ERROR: "INT_002";
    readonly INTERNAL_EXTERNAL_SERVICE: "INT_003";
    readonly CONFLICT: "CONFLICT_001";
    readonly FORBIDDEN: "AUTH_006";
    readonly BAD_REQUEST: "VAL_001";
};
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';
export type ErrorCategory = 'auth' | 'session' | 'validation' | 'network' | 'not_found' | 'rate_limit' | 'internal' | 'conflict';
export declare function getErrorCategory(code: string): ErrorCategory;
//# sourceMappingURL=codes.d.ts.map