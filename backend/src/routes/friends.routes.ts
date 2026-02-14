import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { FriendshipService } from '../services/friendship.service.js';
import { NotFoundError } from '../utils/errors.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface FriendsRoutesDeps {
  friendshipService?: FriendshipService;
  authPreHandler?: AuthPreHandler;
}

export function buildFriendsRoutes(deps: FriendsRoutesDeps = {}) {
  return async function friendsRoutes(fastify: FastifyInstance) {
    const friendshipService = deps.friendshipService ?? new FriendshipService();
    const authPreHandler = deps.authPreHandler ?? authenticate;

    const ensureFeatureEnabled = () => {
      if (!fastify.config.FEATURE_FRIENDS_ENABLED) {
        throw new NotFoundError('Route');
      }
    };

    fastify.get<{
      Querystring: { section?: 'all' | 'lagalaga' | 'requests' | 'roblox_suggestions' };
    }>(
      '/api/user/friends',
      {
        preHandler: authPreHandler,
        schema: {
          querystring: {
            type: 'object',
            properties: {
              section: {
                type: 'string',
                enum: ['all', 'lagalaga', 'requests', 'roblox_suggestions'],
              },
            },
          },
        },
      },
      async (request, reply) => {
        ensureFeatureEnabled();
        const data = await friendshipService.listFriends(request.user.userId, request.query.section ?? 'all');
        return reply.send({
          success: true,
          data,
          requestId: String(request.id),
        });
      }
    );

    fastify.post('/api/user/friends/refresh', { preHandler: authPreHandler }, async (request, reply) => {
      ensureFeatureEnabled();
      const data = await friendshipService.refreshRobloxCache(request.user.userId);
      return reply.send({
        success: true,
        data,
        requestId: String(request.id),
      });
    });

    fastify.post<{
      Body: { targetUserId: string };
    }>(
      '/api/friends/request',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            required: ['targetUserId'],
            properties: {
              targetUserId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        ensureFeatureEnabled();
        const data = await friendshipService.sendRequest(request.user.userId, request.body.targetUserId);
        return reply.send({ success: true, data, requestId: String(request.id) });
      }
    );

    fastify.post<{
      Body: { friendshipId: string };
    }>(
      '/api/friends/accept',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            required: ['friendshipId'],
            properties: {
              friendshipId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        ensureFeatureEnabled();
        const data = await friendshipService.acceptRequest(request.user.userId, request.body.friendshipId);
        return reply.send({ success: true, data, requestId: String(request.id) });
      }
    );

    fastify.post<{
      Body: { friendshipId: string };
    }>(
      '/api/friends/reject',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            required: ['friendshipId'],
            properties: {
              friendshipId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        ensureFeatureEnabled();
        const data = await friendshipService.rejectRequest(request.user.userId, request.body.friendshipId);
        return reply.send({ success: true, data, requestId: String(request.id) });
      }
    );

    fastify.delete<{
      Params: { friendshipId: string };
    }>(
      '/api/friends/:friendshipId',
      {
        preHandler: authPreHandler,
        schema: {
          params: {
            type: 'object',
            required: ['friendshipId'],
            properties: {
              friendshipId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        ensureFeatureEnabled();
        const data = await friendshipService.remove(request.user.userId, request.params.friendshipId);
        return reply.send({ success: true, data, requestId: String(request.id) });
      }
    );
  };
}

export const friendsRoutes = buildFriendsRoutes();
