import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictError, ErrorCodes, SessionError } from '../../utils/errors.js';

const sessionId = '11111111-1111-1111-1111-111111111111';

let activeSupabaseMock: any;

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabaseMock,
}));
jest.unstable_mockModule('../../services/achievementService.js', () => ({
  AchievementService: class {
    async incrementUserStat() {}
    async evaluateAndUnlock() {}
  },
}));

const { buildSessionsRoutesV2 } = await import('../../routes/sessions-v2.js');
const { errorHandlerPlugin } = await import('../../plugins/errorHandler.js');

afterAll(() => {
  activeSupabaseMock = null;
});

async function buildApp({
  sessionService,
  rankingService,
  authPreHandler,
  supabaseMock,
}: {
  sessionService?: any;
  rankingService?: any;
  authPreHandler?: any;
  supabaseMock?: any;
} = {}) {
  activeSupabaseMock = supabaseMock;

  const { default: Fastify } = await import('fastify');
  const app = Fastify({ logger: false });
  (app as any).config = { NODE_ENV: 'test' };

  await app.register(errorHandlerPlugin);
  await app.register(buildSessionsRoutesV2({ sessionService, rankingService, authPreHandler }));
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

    const { default: request } = await import('supertest');
    const res = await request(app.server).get('/api/sessions/not-a-uuid');
    await app.close();

    expect(res.status).toBe(400);
    expect(['VAL_001', 'FST_ERR_VALIDATION']).toContain(res.body.error?.code ?? res.body.code);
    expect(getSessionById).not.toHaveBeenCalled();
  });

  it('returns 404 when session is not found', async () => {
    const getSessionById = jest.fn(async (_id: string, _requesterId: string | null) => null);
    const app = await buildApp({ sessionService: { getSessionById } });

    const { default: request } = await import('supertest');
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

    const { default: request } = await import('supertest');
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
    const { default: request } = await import('supertest');
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
    const { default: request } = await import('supertest');
    const res = await request(app.server).get('/api/invites/MISSING');
    await app.close();

    expect(res.status).toBe(404);
    expect(res.body.error?.code ?? res.body.code).toBe('NOT_FOUND_001');
  });

  it('sets ranked flag on ranked session creation', async () => {
    const createSession: any = jest.fn(async () => ({
      session: { id: sessionId },
      inviteLink: 'lagalaga://invite/ABC123',
    }));

    const app = await buildApp({
      sessionService: { createSession, createQuickSession: jest.fn() },
      authPreHandler: async (req: any) => {
        req.user = { userId: 'host-1' };
      },
    });

    const { default: request } = await import('supertest');
    const res = await request(app.server)
      .post('/api/sessions')
      .send({
        robloxUrl: 'https://www.roblox.com/games/606849621/Jailbreak',
        title: 'Ranked Session',
        is_ranked: true,
        visibility: 'public',
      });
    await app.close();

    expect(res.status).toBe(201);
    const createInput = (createSession as any).mock.calls[0]?.[0];
    expect(createInput?.isRanked).toBe(true);
    expect(createInput?.visibility).toBe('public');
  });

  it('rejects ranked session creation with non-public visibility', async () => {
    const createSession = jest.fn();
    const app = await buildApp({
      sessionService: { createSession, createQuickSession: jest.fn() },
      authPreHandler: async (req: any) => {
        req.user = { userId: 'host-1' };
      },
    });

    const { default: request } = await import('supertest');
    const res = await request(app.server)
      .post('/api/sessions')
      .send({
        robloxUrl: 'https://www.roblox.com/games/606849621/Jailbreak',
        title: 'Ranked Session',
        is_ranked: true,
        visibility: 'friends',
      });
    await app.close();

    expect(res.status).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toBe('VAL_001');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns 403 when non-host submits ranked result', async () => {
    const submitMatchResult = jest.fn(async () => {
      throw new SessionError(ErrorCodes.FORBIDDEN, 'Only the host can submit ranked results', 403);
    });
    const enforceSubmissionRateLimit = jest.fn();

    const app = await buildApp({
      rankingService: { submitMatchResult, enforceSubmissionRateLimit },
      authPreHandler: async (req: any) => {
        req.user = { userId: 'user-2' };
      },
    });

    const { default: request } = await import('supertest');
    const res = await request(app.server)
      .post(`/api/sessions/${sessionId}/result`)
      .send({ winnerId: '22222222-2222-2222-2222-222222222222' });
    await app.close();

    expect(res.status).toBe(403);
    expect(res.body.error?.code ?? res.body.code).toBe('AUTH_006');
  });

  it('returns 409 when submitting ranked result twice', async () => {
    const submitMatchResult = jest.fn(async () => {
      throw new ConflictError('Result already submitted for this session');
    });
    const enforceSubmissionRateLimit = jest.fn();

    const app = await buildApp({
      rankingService: { submitMatchResult, enforceSubmissionRateLimit },
      authPreHandler: async (req: any) => {
        req.user = { userId: 'host-1' };
      },
    });

    const { default: request } = await import('supertest');
    const res = await request(app.server)
      .post(`/api/sessions/${sessionId}/result`)
      .send({ winnerId: '33333333-3333-3333-3333-333333333333' });
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.error?.code ?? res.body.code).toBe('CONFLICT_001');
  });
});
