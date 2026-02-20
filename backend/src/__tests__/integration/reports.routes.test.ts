import Fastify, { type FastifyInstance } from 'fastify';
import request from 'supertest';
import { describe, beforeEach, expect, it } from '@jest/globals';
import { authPlugin } from '../../plugins/auth.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { buildReportsRoutes } from '../../routes/reports.routes.js';
import { RateLimitError } from '../../utils/errors.js';
import type { ReportingService } from '../../services/reporting.service.js';

function buildConfig() {
  return {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret',
    JWT_EXPIRY: '15m',
    REFRESH_TOKEN_SECRET: 'test-refresh-secret',
    REFRESH_TOKEN_EXPIRY: '7d',
  };
}

describe('Reports routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    (app as any).config = buildConfig();
    await app.register(authPlugin);
    await app.register(errorHandlerPlugin);
  });

  it('requires authentication for POST /api/reports', async () => {
    await app.register(buildReportsRoutes());
    await app.ready();

    const response = await request(app.server)
      .post('/api/reports')
      .send({
        category: 'OTHER',
        description: 'Concern for review',
        targetType: 'GENERAL',
      });

    expect(response.status).toBe(401);
    await app.close();
  });

  it('creates report and returns ticket id', async () => {
    const reportingServiceMock: Pick<ReportingService, 'createReport'> = {
      createReport: async () => ({
        ticketId: '5af1b5c5-2fce-4b91-b6a5-5ff10d58ed10',
        status: 'OPEN',
        createdAt: '2026-02-20T20:00:00.000Z',
      }),
    };

    await app.register(buildReportsRoutes({
      reportingService: reportingServiceMock as ReportingService,
      authPreHandler: async (req: any) => {
        req.user = {
          userId: 'user-1',
          robloxUserId: '123',
          robloxUsername: 'tester',
          tokenVersion: 0,
        };
      },
    }));
    await app.ready();

    const response = await request(app.server)
      .post('/api/reports')
      .send({
        category: 'HARASSMENT_OR_ABUSIVE_BEHAVIOR',
        description: 'Abusive messages in session chat',
        targetType: 'SESSION',
        targetSessionId: 'session-1',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        ticketId: '5af1b5c5-2fce-4b91-b6a5-5ff10d58ed10',
        status: 'OPEN',
      },
    });

    await app.close();
  });

  it('returns 429 when report submission is rate limited', async () => {
    const reportingServiceMock: Pick<ReportingService, 'createReport'> = {
      createReport: async () => {
        throw new RateLimitError('Too many reports submitted');
      },
    };

    await app.register(buildReportsRoutes({
      reportingService: reportingServiceMock as ReportingService,
      authPreHandler: async (req: any) => {
        req.user = {
          userId: 'user-1',
          robloxUserId: '123',
          robloxUsername: 'tester',
          tokenVersion: 0,
        };
      },
    }));
    await app.ready();

    const response = await request(app.server)
      .post('/api/reports')
      .send({
        category: 'OTHER',
        description: 'Repeated safety issue details',
        targetType: 'GENERAL',
      });

    expect(response.status).toBe(429);
    await app.close();
  });
});
