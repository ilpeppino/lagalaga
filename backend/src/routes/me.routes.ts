import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxFavoritesService } from '../services/roblox-favorites.service.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface MeRoutesDeps {
  favoritesService?: RobloxFavoritesService;
  authPreHandler?: AuthPreHandler;
}

export function buildMeRoutes(deps: MeRoutesDeps = {}) {
  return async function meRoutes(fastify: FastifyInstance) {
    const favoritesService = deps.favoritesService ?? new RobloxFavoritesService();
    const authPreHandler = deps.authPreHandler ?? authenticate;

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
  };
}

export const meRoutes = buildMeRoutes();
