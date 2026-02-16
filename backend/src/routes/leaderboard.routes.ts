import { FastifyInstance } from 'fastify';
import { isCompetitiveDepthEnabled } from '../config/featureFlags.js';
import { LeaderboardService } from '../services/leaderboardService.js';

interface LeaderboardRoutesDeps {
  leaderboardService?: LeaderboardService;
}

export function buildLeaderboardRoutes(deps: LeaderboardRoutesDeps = {}) {
  return async function leaderboardRoutes(fastify: FastifyInstance) {
    const leaderboardService = deps.leaderboardService ?? new LeaderboardService();

    fastify.get<{
      Querystring: { type?: string };
    }>(
      '/api/leaderboard',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              type: { type: 'string', default: 'weekly' },
            },
          },
        },
      },
      async (request, reply) => {
        const data = await leaderboardService.getLeaderboard(
          request.query.type || 'weekly',
          isCompetitiveDepthEnabled(fastify)
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

export const leaderboardRoutes = buildLeaderboardRoutes();
