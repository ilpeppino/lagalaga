import { beforeAll, describe, expect, it } from '@jest/globals';

type ProviderName = 'supabase' | 'postgres';

interface ProviderContext {
  name: ProviderName;
  baseUrl: string;
  hostToken: string;
  guestToken: string;
  guestUserId: string;
  sessionId?: string;
  friendshipId?: string;
}

interface HttpResult {
  status: number;
  body: any;
  headers: Headers;
}

const ENABLE_HARNESS = process.env.DUAL_PROVIDER_HARNESS === '1';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    token?: string;
    body?: unknown;
  } = {}
): Promise<HttpResult> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();

  return { status: response.status, body, headers: response.headers };
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      if (key === 'requestId' || key === 'id' || key.endsWith('Id')) {
        output[key] = '<id>';
        continue;
      }
      output[key] = normalize(input[key]);
    }
    return output;
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return '<iso-date>';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return '<uuid>';
    return value.replace(/https?:\/\/[^/]+/g, 'https://<host>');
  }
  return value;
}

async function assertParity(
  label: string,
  supabaseAction: () => Promise<HttpResult>,
  postgresAction: () => Promise<HttpResult>
): Promise<{ supabase: HttpResult; postgres: HttpResult }> {
  const [supabase, postgres] = await Promise.all([supabaseAction(), postgresAction()]);

  expect({ label, status: supabase.status }).toEqual({ label, status: postgres.status });

  expect(normalize(supabase.body)).toEqual(normalize(postgres.body));
  return { supabase, postgres };
}

const describeHarness = ENABLE_HARNESS ? describe : describe.skip;

describeHarness('Dual DB Provider Parity Harness', () => {
  const runId = Date.now();
  let contexts: Record<ProviderName, ProviderContext>;
  let robloxUrl = 'https://www.roblox.com/games/606849621/Jailbreak';

  beforeAll(() => {
    contexts = {
      supabase: {
        name: 'supabase',
        baseUrl: requiredEnv('DUAL_PROVIDER_SUPABASE_URL'),
        hostToken: requiredEnv('DUAL_PROVIDER_HOST_TOKEN'),
        guestToken: requiredEnv('DUAL_PROVIDER_GUEST_TOKEN'),
        guestUserId: requiredEnv('DUAL_PROVIDER_GUEST_USER_ID'),
      },
      postgres: {
        name: 'postgres',
        baseUrl: requiredEnv('DUAL_PROVIDER_POSTGRES_URL'),
        hostToken: requiredEnv('DUAL_PROVIDER_HOST_TOKEN'),
        guestToken: requiredEnv('DUAL_PROVIDER_GUEST_TOKEN'),
        guestUserId: requiredEnv('DUAL_PROVIDER_GUEST_USER_ID'),
      },
    };
    robloxUrl = optionalEnv(
      'DUAL_PROVIDER_SESSION_ROBLOX_URL',
      'https://www.roblox.com/games/606849621/Jailbreak'
    );
  });

  it('parity: health check ping', async () => {
    const sup = await requestJson(contexts.supabase.baseUrl, '/health/detailed');
    const pg = await requestJson(contexts.postgres.baseUrl, '/health/detailed');

    expect(sup.status).toBe(200);
    expect(pg.status).toBe(200);
    expect(sup.body?.status).toBe('healthy');
    expect(pg.body?.status).toBe('healthy');
    expect(sup.body?.provider).toBe('supabase');
    expect(pg.body?.provider).toBe('postgres');
  });

  it('parity: user read/update surface', async () => {
    await assertParity(
      'GET /api/me',
      () => requestJson(contexts.supabase.baseUrl, '/api/me', { token: contexts.supabase.hostToken }),
      () => requestJson(contexts.postgres.baseUrl, '/api/me', { token: contexts.postgres.hostToken })
    );

    await assertParity(
      'GET /api/me/stats',
      () => requestJson(contexts.supabase.baseUrl, '/api/me/stats', { token: contexts.supabase.hostToken }),
      () => requestJson(contexts.postgres.baseUrl, '/api/me/stats', { token: contexts.postgres.hostToken })
    );

    await assertParity(
      'POST /api/me/push-tokens',
      () => requestJson(contexts.supabase.baseUrl, '/api/me/push-tokens', {
        method: 'POST',
        token: contexts.supabase.hostToken,
        body: { expoPushToken: `ExpoPushToken[dual-${runId}]`, platform: 'web' },
      }),
      () => requestJson(contexts.postgres.baseUrl, '/api/me/push-tokens', {
        method: 'POST',
        token: contexts.postgres.hostToken,
        body: { expoPushToken: `ExpoPushToken[dual-${runId}]`, platform: 'web' },
      })
    );
  });

  it('parity: session CRUD + ranking flow', async () => {
    const created = await assertParity(
      'POST /api/sessions',
      () => requestJson(contexts.supabase.baseUrl, '/api/sessions', {
        method: 'POST',
        token: contexts.supabase.hostToken,
        body: {
          robloxUrl,
          title: `Dual Provider Session ${runId}`,
          visibility: 'public',
          is_ranked: true,
          maxParticipants: 4,
        },
      }),
      () => requestJson(contexts.postgres.baseUrl, '/api/sessions', {
        method: 'POST',
        token: contexts.postgres.hostToken,
        body: {
          robloxUrl,
          title: `Dual Provider Session ${runId}`,
          visibility: 'public',
          is_ranked: true,
          maxParticipants: 4,
        },
      })
    );

    contexts.supabase.sessionId = created.supabase.body?.data?.session?.id;
    contexts.postgres.sessionId = created.postgres.body?.data?.session?.id;

    expect(Boolean(contexts.supabase.sessionId)).toBe(true);
    expect(Boolean(contexts.postgres.sessionId)).toBe(true);

    await assertParity(
      'GET /api/sessions',
      () => requestJson(contexts.supabase.baseUrl, '/api/sessions?limit=10'),
      () => requestJson(contexts.postgres.baseUrl, '/api/sessions?limit=10')
    );

    await assertParity(
      'POST /api/sessions/:id/join',
      () => requestJson(contexts.supabase.baseUrl, `/api/sessions/${contexts.supabase.sessionId}/join`, {
        method: 'POST',
        token: contexts.supabase.guestToken,
      }),
      () => requestJson(contexts.postgres.baseUrl, `/api/sessions/${contexts.postgres.sessionId}/join`, {
        method: 'POST',
        token: contexts.postgres.guestToken,
      })
    );

    await assertParity(
      'POST /api/sessions/:id/result',
      () => requestJson(contexts.supabase.baseUrl, `/api/sessions/${contexts.supabase.sessionId}/result`, {
        method: 'POST',
        token: contexts.supabase.hostToken,
        body: { winnerId: contexts.supabase.guestUserId },
      }),
      () => requestJson(contexts.postgres.baseUrl, `/api/sessions/${contexts.postgres.sessionId}/result`, {
        method: 'POST',
        token: contexts.postgres.hostToken,
        body: { winnerId: contexts.postgres.guestUserId },
      })
    );

    await assertParity(
      'GET /api/me/match-history',
      () => requestJson(contexts.supabase.baseUrl, '/api/me/match-history?limit=10', { token: contexts.supabase.hostToken }),
      () => requestJson(contexts.postgres.baseUrl, '/api/me/match-history?limit=10', { token: contexts.postgres.hostToken })
    );
  });

  it('parity: friendship operations + report creation', async () => {
    const requestResult = await assertParity(
      'POST /api/friends/request',
      () => requestJson(contexts.supabase.baseUrl, '/api/friends/request', {
        method: 'POST',
        token: contexts.supabase.hostToken,
        body: { targetUserId: contexts.supabase.guestUserId },
      }),
      () => requestJson(contexts.postgres.baseUrl, '/api/friends/request', {
        method: 'POST',
        token: contexts.postgres.hostToken,
        body: { targetUserId: contexts.postgres.guestUserId },
      })
    );

    contexts.supabase.friendshipId = requestResult.supabase.body?.data?.friendshipId;
    contexts.postgres.friendshipId = requestResult.postgres.body?.data?.friendshipId;

    expect(Boolean(contexts.supabase.friendshipId)).toBe(true);
    expect(Boolean(contexts.postgres.friendshipId)).toBe(true);

    await assertParity(
      'POST /api/friends/accept',
      () => requestJson(contexts.supabase.baseUrl, '/api/friends/accept', {
        method: 'POST',
        token: contexts.supabase.guestToken,
        body: { friendshipId: contexts.supabase.friendshipId },
      }),
      () => requestJson(contexts.postgres.baseUrl, '/api/friends/accept', {
        method: 'POST',
        token: contexts.postgres.guestToken,
        body: { friendshipId: contexts.postgres.friendshipId },
      })
    );

    await assertParity(
      'GET /api/user/friends?section=lagalaga',
      () => requestJson(contexts.supabase.baseUrl, '/api/user/friends?section=lagalaga', { token: contexts.supabase.hostToken }),
      () => requestJson(contexts.postgres.baseUrl, '/api/user/friends?section=lagalaga', { token: contexts.postgres.hostToken })
    );

    await assertParity(
      'POST /api/reports',
      () => requestJson(contexts.supabase.baseUrl, '/api/reports', {
        method: 'POST',
        token: contexts.supabase.hostToken,
        body: {
          category: 'OTHER',
          description: `Dual provider parity report ${runId}`,
          targetType: 'GENERAL',
        },
      }),
      () => requestJson(contexts.postgres.baseUrl, '/api/reports', {
        method: 'POST',
        token: contexts.postgres.hostToken,
        body: {
          category: 'OTHER',
          description: `Dual provider parity report ${runId}`,
          targetType: 'GENERAL',
        },
      })
    );
  });
});
