import Fastify from 'fastify';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';

const sessionId = '11111111-1111-1111-1111-111111111111';

let buildSessionsRoutesV2: typeof import('../../routes/sessions-v2.js').buildSessionsRoutesV2;
let errorHandlerPlugin: typeof import('../../plugins/errorHandler.js').errorHandlerPlugin;
let activeSupabaseMock: any;

beforeAll(async () => {
  await jest.unstable_mockModule('../../config/supabase.js', () => ({
    getSupabase: () => activeSupabaseMock,
  }));

  ({ buildSessionsRoutesV2 } = await import('../../routes/sessions-v2.js'));
  ({ errorHandlerPlugin } = await import('../../plugins/errorHandler.js'));
});

afterAll(() => {
  activeSupabaseMock = null;
});

async function buildApp({
  sessionService,
  authPreHandler,
  supabaseMock,
}: {
  sessionService?: any;
  authPreHandler?: any;
  supabaseMock?: any;
} = {}) {
  activeSupabaseMock = supabaseMock;

  const app = Fastify({ logger: false });
  (app as any).config = { NODE_ENV: 'test' };

  await app.register(errorHandlerPlugin);
  await app.register(buildSessionsRoutesV2({ sessionService, authPreHandler }));
  await app.ready();
  return app;
}

describe('sessions v2 routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for invalid session id', async () => {
    const getSessionById = jest.fn();
    const app = await buildApp({ sessionService: { getSessionById } });

    const res = await request(app.server).get('/api/sessions/not-a-uuid');
    await app.close();

    expect(res.status).toBe(400);
    expect(['VAL_001', 'FST_ERR_VALIDATION']).toContain(res.body.error?.code ?? res.body.code);
    expect(getSessionById).not.toHaveBeenCalled();
  });

  it('returns 404 when session is not found', async () => {
    const getSessionById = jest.fn(async (_id: string, _requesterId: string | null) => null);
    const app = await buildApp({ sessionService: { getSessionById } });

    const res = await request(app.server).get(`/api/sessions/${sessionId}`);
    await app.close();

    expect(res.status).toBe(404);
    expect(res.body.error?.code ?? res.body.code).toBe('NOT_FOUND_001');
    expect(getSessionById).toHaveBeenCalledWith(sessionId, null);
  });

  it('rejects bulk delete with invalid ids', async () => {
    const bulkDeleteSessions = jest.fn();
    const app = await buildApp({
      sessionService: { bulkDeleteSessions },
      authPreHandler: async (req: any) => {
        req.user = { userId: 'user-1' };
      },
    });

    const res = await request(app.server)
      .post('/api/sessions/bulk-delete')
      .send({ ids: ['bad-id'] });
    await app.close();

    expect(res.status).toBe(400);
    expect(['VAL_001', 'FST_ERR_VALIDATION']).toContain(res.body.error?.code ?? res.body.code);
    expect(bulkDeleteSessions).not.toHaveBeenCalled();
  });

  it('returns invite session summary', async () => {
    const supabaseMock = {
      from: jest.fn((table: string) => {
        if (table !== 'session_invites') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: async () => ({
                data: {
                  session_id: sessionId,
                  session: {
                    id: sessionId,
                    title: 'Invite Session',
                    max_participants: 6,
                    game: {
                      place_id: 606849621,
                      game_name: 'Jailbreak',
                      canonical_web_url: 'https://www.roblox.com/games/606849621',
                    },
                    session_participants: [{ count: 3 }],
                  },
                },
                error: null,
              }),
            })),
          })),
        };
      }),
    };

    const app = await buildApp({ supabaseMock });
    const res = await request(app.server).get('/api/invites/INV123');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe(sessionId);
    expect(res.body.data.session.currentParticipants).toBe(3);
    expect(res.body.data.session.game.canonicalWebUrl).toBe('https://www.roblox.com/games/606849621');
  });

  it('returns 404 when invite code is not found', async () => {
    const supabaseMock = {
      from: jest.fn((table: string) => {
        if (table !== 'session_invites') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: async () => ({
                data: null,
                error: { message: 'not found' },
              }),
            })),
          })),
        };
      }),
    };

    const app = await buildApp({ supabaseMock });
    const res = await request(app.server).get('/api/invites/MISSING');
    await app.close();

    expect(res.status).toBe(404);
    expect(res.body.error?.code ?? res.body.code).toBe('NOT_FOUND_001');
  });

});
