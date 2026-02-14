import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxFavoritesService } from '../services/roblox-favorites.service.js';
import { FavoriteExperiencesService } from '../services/favorite-experiences.service.js';
import { RobloxFriendsCacheService } from '../services/roblox-friends-cache.service.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface MeRoutesDeps {
  favoritesService?: RobloxFavoritesService;
  favoriteExperiencesService?: FavoriteExperiencesService;
  friendsCacheService?: RobloxFriendsCacheService;
  authPreHandler?: AuthPreHandler;
}

export function buildMeRoutes(deps: MeRoutesDeps = {}) {
  return async function meRoutes(fastify: FastifyInstance) {
    const favoritesService = deps.favoritesService ?? new RobloxFavoritesService();
    const favoriteExperiencesService = deps.favoriteExperiencesService;
    const friendsCacheService = deps.friendsCacheService ?? new RobloxFriendsCacheService();
    const authPreHandler = deps.authPreHandler ?? authenticate;

    /**
     * GET /api/me
     * Get current user profile with Roblox connection status
     */
    fastify.get(
      '/',
      {
        preHandler: authPreHandler,
      },
      async (request, reply) => {
        const { getMeData } = await import('../services/me.service.js');
        const data = await getMeData(request.user.userId, fastify);

        return reply.send({
          success: true,
          data,
          requestId: String(request.id),
        });
      }
    );

    fastify.get<{
      Querystring: {
        limit?: number;
        cursor?: string;
      };
    }>(
      '/roblox/favorites',
      {
        preHandler: authPreHandler,
        schema: {
          querystring: {
            type: 'object',
            properties: {
              limit: { type: 'number', minimum: 1, maximum: 100 },
              cursor: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const data = await favoritesService.getFavoritesForUser(
          request.user.userId,
          {
            limit: request.query.limit,
            cursor: request.query.cursor,
          }
        );

        return reply.send({
          success: true,
          data,
          requestId: String(request.id),
        });
      }
    );

    fastify.get(
      '/roblox/friends',
      {
        preHandler: authPreHandler,
      },
      async (request, reply) => {
        const data = await friendsCacheService.getFriendsForUser(request.user.userId);

        return reply.send({
          success: true,
          data,
          requestId: String(request.id),
        });
      }
    );

    fastify.post(
      '/roblox/friends/refresh',
      {
        preHandler: authPreHandler,
      },
      async (request, reply) => {
        const data = await friendsCacheService.getFriendsForUser(request.user.userId, {
          forceRefresh: true,
        });

        return reply.send({
          success: true,
          data,
          requestId: String(request.id),
        });
      }
    );

    fastify.get(
      '/favorite-experiences',
      {
        preHandler: authPreHandler,
      },
      async (request, reply) => {
        const service = favoriteExperiencesService ?? new FavoriteExperiencesService();
        const ifNoneMatchHeader = Array.isArray(request.headers['if-none-match'])
          ? request.headers['if-none-match'].join(',')
          : request.headers['if-none-match'];

        const result = await service.getFavoriteExperiences(
          request.user.userId,
          request.user.robloxUserId,
          ifNoneMatchHeader
        );

        if (result.kind === 'not_modified') {
          reply.header('ETag', result.etag);
          return reply.status(304).send();
        }

        reply.header('ETag', result.payload.etag);
        return reply.send(result.payload);
      }
    );
  };
}

export const meRoutes = buildMeRoutes();
