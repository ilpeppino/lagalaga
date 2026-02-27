import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  AccountDeletionService,
  type DeletionInitiator,
  type DeletionStatusResponse,
} from '../services/account-deletion.service.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { monitoring } from '../lib/monitoring.js';

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

    fastify.delete<{
      Body: { confirmationText: string };
    }>('/', {
      preHandler: authPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['confirmationText'],
          properties: {
            confirmationText: { type: 'string', minLength: 1, maxLength: 32 },
          },
        },
      },
    }, async (request, reply) => {
      const normalized = request.body.confirmationText.trim().toUpperCase();
      if (normalized !== 'DELETE') {
        throw new AppError(
          ErrorCodes.VALIDATION_INVALID_FORMAT,
          'Invalid confirmation text. Type DELETE to continue.',
          400
        );
      }

      const result = await accountDeletionService.deleteAccountNow({
        userId: request.user.userId,
        initiator: 'IN_APP',
      });

      monitoring.captureMessage('account_deleted', 'info');
      request.log.info(
        {
          event: 'account_deleted',
          authProvider: result.authProvider,
          initiator: 'IN_APP',
          type: 'account',
        },
        'Account deleted'
      );

      return reply.send({
        success: true,
        deletedAt: result.deletedAt,
      });
    });
  };
}

export const accountRoutes = buildAccountRoutes();
