import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { requireRobloxConnected } from '../middleware/requireRobloxConnected.js';
import { RobloxConnectionService } from '../services/roblox-connection.service.js';
import { RobloxPresenceService } from '../services/roblox-presence.service.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
type RobloxConnectedPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface PresenceRoutesDeps {
  presenceService?: RobloxPresenceService;
  authPreHandler?: AuthPreHandler;
  robloxConnectedPreHandler?: RobloxConnectedPreHandler;
}

export function buildPresenceRoutes(deps: PresenceRoutesDeps = {}) {
  return async function presenceRoutes(fastify: FastifyInstance) {
    const authPreHandler = deps.authPreHandler ?? authenticate;
    const robloxConnectedPreHandler = deps.robloxConnectedPreHandler ?? requireRobloxConnected;
    const presenceService = deps.presenceService ?? new RobloxPresenceService({
      connectionService: new RobloxConnectionService(fastify),
    });

    fastify.post<{
      Body: { userIds: number[] };
    }>('/api/roblox/presence', {
      preHandler: [authPreHandler, robloxConnectedPreHandler],
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
      preHandler: [authPreHandler, robloxConnectedPreHandler],
      schema: {
        querystring: {
          type: 'object',
          required: ['userIds'],
          properties: {
            userIds: { type: 'string', maxLength: 500 },
          },
        },
      },
    }, async (request, reply) => {
      const userIds = request.query.userIds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (userIds.length > 50) {
        return reply.status(400).send({ error: 'Too many user IDs (max 50)' });
      }

      const data = await presenceService.getPresenceForUsers(request.user.userId, userIds);

      return reply.send(data);
    });
  };
}

export const presenceRoutes = buildPresenceRoutes();
