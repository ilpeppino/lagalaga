/**
 * PII sanitizer — recursively redacts sensitive values from objects.
 * Registered as a Pino serializer and used before logging.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'secret',
  'authorization',
  'codeverifier',
  'code_verifier',
  'codechallenge',
  'code_challenge',
  'cookie',
  'supabase_service_role_key',
  'supabase_anon_key',
  'roblox_client_secret',
  'jwt_secret',
]);

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

/**
 * Recursively sanitize an object, replacing sensitive values with [REDACTED].
 * Handles circular references gracefully.
 */
export function sanitize<T>(obj: T, seen = new WeakSet()): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  // Prevent circular references
  if (seen.has(obj as object)) return '[Circular]' as unknown as T;
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value, seen);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Pino serializer that sanitizes request objects.
 */
export function sanitizedReqSerializer(req: Record<string, unknown>): Record<string, unknown> {
  return sanitize({
    method: req.method,
    url: req.url,
    headers: req.headers,
    remoteAddress: req.remoteAddress,
  });
}

/**
 * Pino serializer that sanitizes response objects.
 */
export function sanitizedResSerializer(res: Record<string, unknown>): Record<string, unknown> {
  return sanitize({
    statusCode: res.statusCode,
    headers: res.headers,
  });
}
