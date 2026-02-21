import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isCompetitiveDepthEnabled } from '../config/featureFlags.js';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxFavoritesService } from '../services/roblox-favorites.service.js';
import { FavoriteExperiencesService } from '../services/favorite-experiences.service.js';
import { RobloxFriendsCacheService } from '../services/roblox-friends-cache.service.js';
import { MatchHistoryService } from '../services/matchHistoryService.js';
import { getSupabase } from '../config/supabase.js';
import { AppError, ValidationError, ErrorCodes } from '../utils/errors.js';
import { AchievementService } from '../services/achievementService.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface MeRoutesDeps {
  favoritesService?: RobloxFavoritesService;
  favoriteExperiencesService?: FavoriteExperiencesService;
  friendsCacheService?: RobloxFriendsCacheService;
  matchHistoryService?: MatchHistoryService;
  authPreHandler?: AuthPreHandler;
}

export function buildMeRoutes(deps: MeRoutesDeps = {}) {
  return async function meRoutes(fastify: FastifyInstance) {
    const favoritesService = deps.favoritesService ?? new RobloxFavoritesService();
    const favoriteExperiencesService = deps.favoriteExperiencesService;
    const friendsCacheService = deps.friendsCacheService ?? new RobloxFriendsCacheService();
    const matchHistoryService = deps.matchHistoryService ?? new MatchHistoryService();
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

    /**
     * GET /api/me/stats
     * Get current user stats and achievements
     */
    fastify.get(
      '/stats',
      {
        preHandler: authPreHandler,
      },
      async (request, reply) => {
        const achievementService = new AchievementService();
        const data = await achievementService.getUserStatsAndAchievements(request.user.userId);

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
      };
    }>(
      '/match-history',
      {
        preHandler: authPreHandler,
        schema: {
          querystring: {
            type: 'object',
            properties: {
              limit: { type: 'number', minimum: 1, maximum: 50 },
            },
          },
        },
      },
      async (request, reply) => {
        if (!isCompetitiveDepthEnabled(fastify)) {
          throw new AppError(ErrorCodes.NOT_FOUND, 'Route not found', 404);
        }

        const data = await matchHistoryService.getMyMatchHistory(
          request.user.userId,
          request.query.limit
        );

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

    fastify.get<{
      Querystring: {
        force?: boolean | string;
      };
    }>(
      '/favorite-experiences',
      {
        preHandler: authPreHandler,
      },
      async (request, reply) => {
        const service = favoriteExperiencesService ?? new FavoriteExperiencesService();
        const ifNoneMatchHeader = Array.isArray(request.headers['if-none-match'])
          ? request.headers['if-none-match'].join(',')
          : request.headers['if-none-match'];

        const forceParam = request.query.force;
        const forceRefresh = forceParam === true || forceParam === 'true' || forceParam === '1';

        const result = await service.getFavoriteExperiences(
          request.user.userId,
          request.user.robloxUserId,
          ifNoneMatchHeader,
          { forceRefresh }
        );

        if (result.kind === 'not_modified') {
          reply.header('ETag', result.etag);
          return reply.status(304).send();
        }

        reply.header('ETag', result.payload.etag);
        return reply.send(result.payload);
      }
    );

    fastify.post<{
      Body: {
        expoPushToken: string;
        deviceId?: string;
        platform?: 'ios' | 'android' | 'web';
      };
    }>(
      '/push-tokens',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            required: ['expoPushToken'],
            properties: {
              expoPushToken: { type: 'string' },
              deviceId: { type: 'string' },
              platform: { type: 'string', enum: ['ios', 'android', 'web'] },
            },
          },
        },
      },
      async (request, reply) => {
        const { expoPushToken, deviceId, platform } = request.body;
        if (
          !expoPushToken.startsWith('ExponentPushToken[') &&
          !expoPushToken.startsWith('ExpoPushToken[')
        ) {
          throw new ValidationError('Invalid Expo push token format');
        }

        request.log.info(
          { userId: request.user.userId, platform: platform ?? null, tokenSuffix: expoPushToken.slice(-20) },
          'push_token_register: upserting'
        );

        const supabase = getSupabase();
        const { error } = await supabase
          .from('user_push_tokens')
          .upsert(
            {
              user_id: request.user.userId,
              expo_push_token: expoPushToken,
              device_id: deviceId || null,
              platform: platform || null,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,expo_push_token' }
          );

        if (error) {
          request.log.error(
            { userId: request.user.userId, platform: platform ?? null, dbError: error.message },
            'push_token_register: upsert failed'
          );
          throw new AppError(
            ErrorCodes.INTERNAL_ERROR,
            `Failed to upsert push token: ${error.message}`
          );
        }

        request.log.info(
          { userId: request.user.userId, platform: platform ?? null },
          'push_token_register: success'
        );

        return reply.status(204).send();
      }
    );

    fastify.delete<{
      Body: {
        expoPushToken: string;
      };
    }>(
      '/push-tokens',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            required: ['expoPushToken'],
            properties: {
              expoPushToken: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const supabase = getSupabase();
        await supabase
          .from('user_push_tokens')
          .delete()
          .eq('user_id', request.user.userId)
          .eq('expo_push_token', request.body.expoPushToken);

        return reply.status(204).send();
      }
    );
  };
}

export const meRoutes = buildMeRoutes();
