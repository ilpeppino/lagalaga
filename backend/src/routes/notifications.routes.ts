import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { getSupabase } from '../config/supabase.js';
import { NotificationPreferencesService } from '../services/notification-preferences.service.js';
import { ValidationError, AppError, ErrorCodes } from '../utils/errors.js';

type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface NotificationsRoutesDeps {
  authPreHandler?: AuthPreHandler;
  prefsService?: NotificationPreferencesService;
}

interface InboxRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.floor(limit ?? 20)));
}

export function buildNotificationsRoutes(deps: NotificationsRoutesDeps = {}) {
  return async function notificationsRoutes(fastify: FastifyInstance) {
    const authPreHandler = deps.authPreHandler ?? authenticate;
    const prefsService = deps.prefsService ?? new NotificationPreferencesService();

    fastify.get('/api/notification-prefs', { preHandler: authPreHandler }, async (request, reply) => {
      const prefs = await prefsService.getForUser(request.user.userId);
      return reply.send({
        success: true,
        data: {
          sessionsRemindersEnabled: prefs.sessionsRemindersEnabled,
          friendRequestsEnabled: prefs.friendRequestsEnabled,
        },
        requestId: String(request.id),
      });
    });

    fastify.patch<{
      Body: {
        sessionsRemindersEnabled?: boolean;
        friendRequestsEnabled?: boolean;
      };
    }>(
      '/api/notification-prefs',
      {
        preHandler: authPreHandler,
        schema: {
          body: {
            type: 'object',
            properties: {
              sessionsRemindersEnabled: { type: 'boolean' },
              friendRequestsEnabled: { type: 'boolean' },
            },
          },
        },
      },
      async (request, reply) => {
        if (
          typeof request.body.sessionsRemindersEnabled !== 'boolean' &&
          typeof request.body.friendRequestsEnabled !== 'boolean'
        ) {
          throw new ValidationError('At least one notification preference must be provided');
        }

        const prefs = await prefsService.updateForUser(request.user.userId, {
          sessionsRemindersEnabled: request.body.sessionsRemindersEnabled,
          friendRequestsEnabled: request.body.friendRequestsEnabled,
        });

        return reply.send({
          success: true,
          data: {
            sessionsRemindersEnabled: prefs.sessionsRemindersEnabled,
            friendRequestsEnabled: prefs.friendRequestsEnabled,
          },
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
      '/api/notifications',
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
        const supabase = getSupabase();
        const limit = clampLimit(request.query.limit);

        let query = supabase
          .from('in_app_notifications')
          .select('id, type, title, body, data, is_read, created_at')
          .eq('user_id', request.user.userId)
          .order('created_at', { ascending: false })
          .limit(limit + 1);

        if (request.query.cursor) {
          query = query.lt('created_at', request.query.cursor);
        }

        const { data, error } = await query;

        if (error) {
          throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load notifications: ${error.message}`);
        }

        const rows = (data ?? []) as InboxRow[];
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;

        return reply.send({
          success: true,
          data: {
            notifications: items.map((row) => ({
              id: row.id,
              type: row.type,
              title: row.title,
              body: row.body,
              data: row.data ?? {},
              isRead: row.is_read,
              createdAt: row.created_at,
            })),
            nextCursor: hasMore ? items[items.length - 1]?.created_at ?? null : null,
          },
          requestId: String(request.id),
        });
      }
    );

    fastify.post<{
      Params: {
        id: string;
      };
    }>(
      '/api/notifications/:id/read',
      {
        preHandler: authPreHandler,
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const supabase = getSupabase();
        const { error } = await supabase
          .from('in_app_notifications')
          .update({ is_read: true })
          .eq('id', request.params.id)
          .eq('user_id', request.user.userId);

        if (error) {
          throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to update notification: ${error.message}`);
        }

        return reply.send({ success: true, data: { updated: true }, requestId: String(request.id) });
      }
    );
  };
}

export const notificationsRoutes = buildNotificationsRoutes();
