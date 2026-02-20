import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  REPORT_CATEGORIES,
  REPORT_TARGET_TYPES,
  ReportingService,
} from '../services/reporting.service.js';
import { AuthError, ErrorCodes } from '../utils/errors.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface ReportsRoutesDeps {
  reportingService?: ReportingService;
  authPreHandler?: AuthPreHandler;
}

interface CreateReportBody {
  category: (typeof REPORT_CATEGORIES)[number];
  description: string;
  targetType: (typeof REPORT_TARGET_TYPES)[number];
  targetUserId?: string;
  targetSessionId?: string;
}

export function buildReportsRoutes(deps: ReportsRoutesDeps = {}) {
  return async function reportsRoutes(fastify: FastifyInstance) {
    const authPreHandler = deps.authPreHandler ?? authenticate;
    const reportingService = deps.reportingService ?? new ReportingService();

    fastify.post<{ Body: CreateReportBody }>(
      '/api/reports',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            required: ['category', 'description', 'targetType'],
            properties: {
              category: { type: 'string', enum: [...REPORT_CATEGORIES] },
              description: { type: 'string', minLength: 1, maxLength: 5000 },
              targetType: { type: 'string', enum: [...REPORT_TARGET_TYPES] },
              targetUserId: { type: 'string' },
              targetSessionId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        if (!request.user?.userId) {
          throw new AuthError(ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication required');
        }

        const result = await reportingService.createReport({
          reporterId: request.user.userId,
          category: request.body.category,
          description: request.body.description,
          targetType: request.body.targetType,
          targetUserId: request.body.targetUserId,
          targetSessionId: request.body.targetSessionId,
          requestId: String(request.id),
          correlationId: request.correlationId,
        });

        return reply.send({
          success: true,
          data: result,
          requestId: String(request.id),
        });
      }
    );
  };
}

export const reportsRoutes = buildReportsRoutes();
