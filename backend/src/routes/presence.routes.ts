import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxConnectionService } from '../services/roblox-connection.service.js';
import { RobloxPresenceService } from '../services/roblox-presence.service.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface PresenceRoutesDeps {
  presenceService?: RobloxPresenceService;
  authPreHandler?: AuthPreHandler;
}

export function buildPresenceRoutes(deps: PresenceRoutesDeps = {}) {
  return async function presenceRoutes(fastify: FastifyInstance) {
    const authPreHandler = deps.authPreHandler ?? authenticate;
    const presenceService = deps.presenceService ?? new RobloxPresenceService({
      connectionService: new RobloxConnectionService(fastify),
    });

    fastify.post<{
      Body: { userIds: number[] };
    }>('/api/roblox/presence', {
      preHandler: authPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['userIds'],
          properties: {
            userIds: {
              type: 'array',
              items: { type: 'integer' },
              maxItems: 50,
            },
          },
        },
      },
    }, async (request, reply) => {
      const { userIds } = request.body;

      const data = await presenceService.getPresenceByRobloxIds(
        request.user.userId,
        userIds
      );

      return reply.send({
        success: true,
        data,
        requestId: String(request.id),
      });
    });

    fastify.get<{
      Querystring: { userIds: string };
    }>('/api/presence/roblox/users', {
      preHandler: authPreHandler,
      schema: {
        querystring: {
          type: 'object',
          required: ['userIds'],
          properties: {
            userIds: { type: 'string' },
          },
        },
      },
    }, async (request, reply) => {
      const userIds = request.query.userIds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      const data = await presenceService.getPresenceForUsers(request.user.userId, userIds);

      return reply.send(data);
    });
  };
}

export const presenceRoutes = buildPresenceRoutes();
