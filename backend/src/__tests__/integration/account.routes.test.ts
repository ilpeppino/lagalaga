import Fastify, { type FastifyInstance } from 'fastify';
import request from 'supertest';
import { describe, beforeEach, expect, it } from '@jest/globals';
import { authPlugin } from '../../plugins/auth.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { buildAccountRoutes } from '../../routes/account.routes.js';
import { RateLimitError } from '../../utils/errors.js';
import type { AccountDeletionService } from '../../services/account-deletion.service.js';

function buildConfig() {
  return {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret',
    JWT_EXPIRY: '15m',
    REFRESH_TOKEN_SECRET: 'test-refresh-secret',
    REFRESH_TOKEN_EXPIRY: '7d',
    ACCOUNT_DELETION_GRACE_DAYS: 7,
  };
}

describe('Account deletion routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    (app as any).config = buildConfig();
    await app.register(authPlugin);
    await app.register(errorHandlerPlugin);
  });

  it('requires authentication for GET /v1/account/deletion-status', async () => {
    await app.register(buildAccountRoutes(), { prefix: '/v1/account' });
    await app.ready();

    const response = await request(app.server).get('/v1/account/deletion-status');

    expect(response.status).toBe(401);
    expect(response.body).toBeTruthy();

    await app.close();
  });

  it('returns idempotent pending request payload from POST /v1/account/deletion-request', async () => {
    const serviceMock: Pick<AccountDeletionService, 'createDeletionRequest'> = {
      createDeletionRequest: async () => ({
        requestId: 'req-123',
        status: 'PENDING',
        requestedAt: '2026-02-17T20:00:00.000Z',
        scheduledPurgeAt: '2026-02-24T20:00:00.000Z',
        completedAt: null,
        retentionSummary: 'Certain security logs and legally required records may be retained where required by law.',
      }),
    };

    await app.register(buildAccountRoutes({
      accountDeletionService: serviceMock as AccountDeletionService,
      authPreHandler: async (req: any) => {
        req.user = {
          userId: 'user-1',
          robloxUserId: '123',
          robloxUsername: 'Tester',
          tokenVersion: 0,
        };
      },
    }), { prefix: '/v1/account' });
    await app.ready();

    const response = await request(app.server)
      .post('/v1/account/deletion-request')
      .send({ initiator: 'IN_APP' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      requestId: 'req-123',
      status: 'PENDING',
    });

    await app.close();
  });

  it('returns 429 when deletion request rate limit is exceeded', async () => {
    const serviceMock: Pick<AccountDeletionService, 'createDeletionRequest'> = {
      createDeletionRequest: async () => {
        throw new RateLimitError('Too many deletion requests');
      },
    };

    await app.register(buildAccountRoutes({
      accountDeletionService: serviceMock as AccountDeletionService,
      authPreHandler: async (req: any) => {
        req.user = {
          userId: 'user-1',
          robloxUserId: '123',
          robloxUsername: 'Tester',
          tokenVersion: 0,
        };
      },
    }), { prefix: '/v1/account' });
    await app.ready();

    const response = await request(app.server)
      .post('/v1/account/deletion-request')
      .send({ initiator: 'IN_APP' });

    expect(response.status).toBe(429);
    expect(response.body).toBeTruthy();

    await app.close();
  });
});
