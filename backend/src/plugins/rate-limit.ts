import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

type RateLimitKeyType = 'user' | 'ip';

interface RateLimitIdentity {
  key: string;
  keyType: RateLimitKeyType;
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ', 2);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim() || null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickStableUserId(request: FastifyRequest): string | null {
  const reqUser = request.user as
    | { id?: unknown; userId?: unknown; sub?: unknown }
    | undefined;

  const directCandidates = [reqUser?.id, reqUser?.userId, reqUser?.sub];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  const token = parseBearerToken(
    Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization
  );
  if (!token) {
    return null;
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return null;
  }

  const payloadCandidates = [payload.id, payload.userId, payload.sub];
  for (const candidate of payloadCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

export function resolveRateLimitIdentity(request: FastifyRequest): RateLimitIdentity {
  const userId = pickStableUserId(request);
  if (userId) {
    return { key: `user:${userId}`, keyType: 'user' };
  }
  return { key: `ip:${request.ip}`, keyType: 'ip' };
}

export const rateLimitPlugin = fp(async (fastify: FastifyInstance) => {
  const rateLimitEnabled = fastify.config?.RATE_LIMIT_ENABLED ?? true;
  if (!rateLimitEnabled) {
    return;
  }

  await fastify.register(rateLimit, {
    global: true,
    max: fastify.config?.RATE_LIMIT_MAX ?? 600,
    timeWindow: fastify.config?.RATE_LIMIT_TIME_WINDOW ?? '1 minute',
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    keyGenerator: (request) => {
      const identity = resolveRateLimitIdentity(request);
      request.rateLimitKeyType = identity.keyType;
      request.rateLimitKey = identity.key;
      request.log.debug(
        {
          rateLimitKeyType: identity.keyType,
          rateLimitKey: identity.key,
          path: request.url,
          method: request.method,
        },
        'Resolved rate-limit key'
      );
      return identity.key;
    },
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.rateLimitKeyType) {
      reply.header('X-RateLimit-KeyType', request.rateLimitKeyType);
      reply.header('X-RateLimit-Key', request.rateLimitKey ?? '');
    }

    const limit = reply.getHeader('x-ratelimit-limit');
    const remaining = reply.getHeader('x-ratelimit-remaining');
    const reset = reply.getHeader('x-ratelimit-reset');
    if (limit !== undefined) reply.header('X-RateLimit-Limit', String(limit));
    if (remaining !== undefined) reply.header('X-RateLimit-Remaining', String(remaining));
    if (reset !== undefined) reply.header('X-RateLimit-Reset', String(reset));

    if (reply.statusCode === 429) {
      if (!reply.hasHeader('X-RateLimit-Source')) {
        reply.header('X-RateLimit-Source', 'backend');
      }
      request.log.warn(
        {
          rateLimitSource: 'backend',
          rateLimitKeyType: request.rateLimitKeyType ?? 'ip',
          rateLimitKey: request.rateLimitKey ?? `ip:${request.ip}`,
          ip: request.ip,
          path: request.url,
          method: request.method,
        },
        'Rate limit exceeded'
      );
    }

    return payload;
  });
}, { name: 'rateLimitPlugin' });

declare module 'fastify' {
  interface FastifyRequest {
    rateLimitKey?: string;
    rateLimitKeyType?: RateLimitKeyType;
  }
}
