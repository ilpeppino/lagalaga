import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  AccountDeletionService,
  type DeletionInitiator,
  type DeletionStatusResponse,
} from '../services/account-deletion.service.js';

interface AccountRoutesDeps {
  accountDeletionService?: AccountDeletionService;
  authPreHandler?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

function toResponsePayload(data: DeletionStatusResponse) {
  return {
    requestId: data.requestId,
    status: data.status,
    requestedAt: data.requestedAt,
    scheduledPurgeAt: data.scheduledPurgeAt,
    completedAt: data.completedAt,
    retentionSummary: data.retentionSummary,
  };
}

export function buildAccountRoutes(deps: AccountRoutesDeps = {}) {
  return async function accountRoutes(fastify: FastifyInstance) {
    const authPreHandler = deps.authPreHandler ?? authenticate;
    const accountDeletionService = deps.accountDeletionService ?? new AccountDeletionService({
      gracePeriodDays: Number(fastify.config.ACCOUNT_DELETION_GRACE_DAYS ?? 7),
      maxRequestsPerHour: 3,
    });

    fastify.post<{
      Body: { initiator?: DeletionInitiator; reason?: string };
    }>(
      '/deletion-request',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            properties: {
              initiator: { type: 'string', enum: ['IN_APP', 'WEB'] },
              reason: { type: 'string', maxLength: 500 },
            },
          },
        },
      },
      async (request, reply) => {
        const result = await accountDeletionService.createDeletionRequest({
          userId: request.user.userId,
          initiator: request.body?.initiator ?? 'IN_APP',
          reason: request.body?.reason,
        });

        return reply.send(toResponsePayload(result));
      }
    );

    fastify.get('/deletion-status', { preHandler: authPreHandler }, async (request, reply) => {
      const result = await accountDeletionService.getDeletionStatus(request.user.userId);
      return reply.send(toResponsePayload(result));
    });

    fastify.post('/deletion-cancel', { preHandler: authPreHandler }, async (request, reply) => {
      const result = await accountDeletionService.cancelDeletionRequest(request.user.userId);
      return reply.send(toResponsePayload(result));
    });
  };
}

export const accountRoutes = buildAccountRoutes();
