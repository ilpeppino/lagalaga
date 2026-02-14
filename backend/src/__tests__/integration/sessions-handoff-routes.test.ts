import Fastify from 'fastify';
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { buildSessionsRoutesV2 } from '../../routes/sessions-v2.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';

const sessionId = '11111111-1111-1111-1111-111111111111';

describe('sessions handoff routes', () => {
  it('updates handoff state via opened/confirmed/stuck endpoints', async () => {
    const updateHandoffState = jest.fn(async (_sessionId: string, _userId: string, handoffState: string) => ({
      sessionId,
      userId: 'user-1',
      handoffState,
    }));

    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    await app.register(errorHandlerPlugin);
    await app.register(buildSessionsRoutesV2({
      sessionService: {
        updateHandoffState,
      } as any,
      authPreHandler: async (req) => {
        (req as any).user = { userId: 'user-1' };
      },
    }));

    await app.ready();

    const opened = await request(app.server).post(`/api/sessions/${sessionId}/handoff/opened`);
    const confirmed = await request(app.server).post(`/api/sessions/${sessionId}/handoff/confirmed`);
    const stuck = await request(app.server).post(`/api/sessions/${sessionId}/handoff/stuck`);

    expect(opened.status).toBe(200);
    expect(opened.body.data.handoffState).toBe('opened_roblox');
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.handoffState).toBe('confirmed_in_game');
    expect(stuck.status).toBe(200);
    expect(stuck.body.data.handoffState).toBe('stuck');

    expect(updateHandoffState).toHaveBeenCalledTimes(3);

    await app.close();
  });

  it('GET /api/sessions/:id includes participant handoff states', async () => {
    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    await app.register(errorHandlerPlugin);
    await app.register(buildSessionsRoutesV2({
      sessionService: {
        getSessionById: jest.fn(async () => ({
          id: sessionId,
          title: 'Test Session',
          hostId: 'host-1',
          placeId: 606849621,
          visibility: 'public',
          status: 'scheduled',
          maxParticipants: 10,
          game: {
            placeId: 606849621,
            canonicalWebUrl: 'https://www.roblox.com/games/606849621',
            canonicalStartUrl: 'https://www.roblox.com/games/start?placeId=606849621',
          },
          participants: [
            { userId: 'host-1', role: 'host', state: 'joined', handoffState: 'confirmed_in_game', joinedAt: '2026-01-01T00:00:00.000Z' },
            { userId: 'user-2', role: 'member', state: 'joined', handoffState: 'stuck', joinedAt: '2026-01-01T00:00:00.000Z' },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
        })),
      } as any,
      authPreHandler: async (req) => {
        (req as any).user = { userId: 'user-1' };
      },
    }));

    await app.ready();

    const res = await request(app.server).get(`/api/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.session.participants[1].handoffState).toBe('stuck');

    await app.close();
  });
});
