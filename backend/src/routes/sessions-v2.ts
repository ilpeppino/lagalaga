import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  SessionServiceV2,
  CreateSessionInput,
  ParticipantHandoffState,
} from '../services/sessionService-v2.js';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { getSupabase } from '../config/supabase.js';

interface SessionsRoutesV2Deps {
  sessionService?: SessionServiceV2;
  authPreHandler?: typeof authenticate;
}

async function getOptionalRequesterId(request: FastifyRequest): Promise<string | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  try {
    const payload = await request.server.jwt.verify<{ userId?: string }>(token);
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

export function buildSessionsRoutesV2(deps: SessionsRoutesV2Deps = {}) {
  return async function sessionsRoutesV2(fastify: FastifyInstance) {
  const sessionService = deps.sessionService ?? new SessionServiceV2();
  const authPreHandler = deps.authPreHandler ?? authenticate;

  /**
   * POST /api/sessions
   * Create new session
   */
  fastify.post<{
    Body: Omit<CreateSessionInput, 'hostUserId'>;
  }>(
    '/api/sessions',
      {
      preHandler: authPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['robloxUrl', 'title'],
          properties: {
            robloxUrl: { type: 'string' },
            title: { type: 'string' },
            visibility: { type: 'string', enum: ['public', 'friends', 'invite_only'] },
            maxParticipants: { type: 'number', minimum: 2, maximum: 50 },
            scheduledStart: { type: 'string' },
            invitedRobloxUserIds: {
              type: 'array',
              items: { type: 'number' },
              maxItems: 200,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { robloxUrl, title, visibility, maxParticipants, scheduledStart, invitedRobloxUserIds } = request.body;

      if (!robloxUrl || !title) {
        throw new ValidationError('robloxUrl and title are required');
      }

      const result = await sessionService.createSession({
        hostUserId: request.user.userId,
        robloxUrl,
        title,
        visibility,
        maxParticipants,
        scheduledStart,
        invitedRobloxUserIds,
      });

      return reply.status(201).send({
        success: true,
        data: result,
        requestId: String(request.id),
      });
    }
  );

  /**
   * GET /api/sessions
   * List sessions (paginated)
   */
  fastify.get<{
    Querystring: {
      status?: string;
      visibility?: string;
      placeId?: number;
      hostId?: string;
      limit?: number;
      offset?: number;
    };
  }>(
    '/api/sessions',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            visibility: { type: 'string' },
            placeId: { type: 'number' },
            hostId: { type: 'string' },
            limit: { type: 'number', default: 20 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const requesterId = await getOptionalRequesterId(request);
      const result = await sessionService.listSessions({
        ...request.query,
        status: request.query.status as any,
        visibility: request.query.visibility as any,
        requesterId,
      });

      return reply.send({
        success: true,
        data: result,
        requestId: String(request.id),
      });
    }
  );

  /**
   * GET /api/user/sessions
   * List current user's planned sessions
   */
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
    };
  }>(
      '/api/user/sessions',
      {
      preHandler: authPreHandler,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 20 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await sessionService.listUserPlannedSessions(
        request.user.userId,
        request.query.limit || 20,
        request.query.offset || 0
      );

      return reply.send({
        success: true,
        data: result,
        requestId: String(request.id),
      });
    }
  );

  /**
   * GET /api/sessions/:id
   * Get session details
   *
   * Note: User-specific sessions are at /api/user/sessions
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/api/sessions/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Explicit guard against non-UUID values (shouldn't happen with schema validation)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(request.params.id)) {
        throw new ValidationError(`Invalid session ID format: ${request.params.id}`);
      }

      const requesterId = await getOptionalRequesterId(request);
      const session = await sessionService.getSessionById(request.params.id, requesterId);

      if (!session) {
        throw new NotFoundError('Session', request.params.id);
      }

      return reply.send({
        success: true,
        data: { session },
        requestId: String(request.id),
      });
    }
  );

  /**
   * POST /api/sessions/:id/join
   * Join session
   */
  fastify.post<{
    Params: { id: string };
    Body: { inviteCode?: string };
  }>(
    '/api/sessions/:id/join',
      {
      preHandler: authPreHandler,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            },
          },
        },
        body: {
          type: 'object',
          properties: {
            inviteCode: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      // Explicit guard against non-UUID values (shouldn't happen with schema validation)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(request.params.id)) {
        throw new ValidationError(`Invalid session ID format: ${request.params.id}`);
      }

      // SessionError / AppError thrown by service will propagate to global handler
      const result = await sessionService.joinSession(
        request.params.id,
        request.user.userId,
        request.body.inviteCode
      );

      return reply.send({
        success: true,
        data: result,
        requestId: String(request.id),
      });
    }
  );

  const handoffStateByPath: Record<string, ParticipantHandoffState> = {
    opened: 'opened_roblox',
    confirmed: 'confirmed_in_game',
    stuck: 'stuck',
  };

  (['opened', 'confirmed', 'stuck'] as const).forEach((statePath) => {
    fastify.post<{ Params: { id: string } }>(
      `/api/sessions/:id/handoff/${statePath}`,
      {
        preHandler: authPreHandler,
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {
                type: 'string',
                pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
              },
            },
          },
        },
      },
      async (request, reply) => {
        const result = await sessionService.updateHandoffState(
          request.params.id,
          request.user.userId,
          handoffStateByPath[statePath]
        );

        return reply.send({
          success: true,
          data: result,
          requestId: String(request.id),
        });
      }
    );
  });

  /**
   * GET /api/invites/:code
   * Get session by invite code
   */
  fastify.get<{
    Params: { code: string };
  }>(
    '/api/invites/:code',
    {
      schema: {
        params: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const supabase = getSupabase();

      const { data: invite, error } = await supabase
        .from('session_invites')
        .select(
          `
            *,
            session:sessions(
              *,
              game:games(*),
              session_participants(count)
            )
          `
        )
        .eq('invite_code', request.params.code)
        .single();

      if (error || !invite) {
        throw new NotFoundError('Invite', request.params.code);
      }

      return reply.send({
        success: true,
        data: {
          sessionId: invite.session_id,
          session: {
            id: invite.session.id,
            title: invite.session.title,
            game: {
              placeId: invite.session.game.place_id,
              gameName: invite.session.game.game_name,
              canonicalWebUrl: invite.session.game.canonical_web_url,
            },
            currentParticipants: invite.session.session_participants[0]?.count || 0,
            maxParticipants: invite.session.max_participants,
          },
        },
        requestId: String(request.id),
      });
    }
  );

  /**
   * DELETE /api/sessions/:id
   * Delete a session (soft delete by setting status to 'cancelled')
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/api/sessions/:id',
      {
      preHandler: authPreHandler,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Explicit guard against non-UUID values
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(request.params.id)) {
        throw new ValidationError(`Invalid session ID format: ${request.params.id}`);
      }

      await sessionService.deleteSession(request.params.id, request.user.userId);

      return reply.send({
        success: true,
        requestId: String(request.id),
      });
    }
  );

  /**
   * POST /api/sessions/bulk-delete
   * Bulk delete sessions (soft delete by setting status to 'cancelled')
   */
  fastify.post<{
    Body: { ids: string[] };
  }>(
    '/api/sessions/bulk-delete',
      {
      preHandler: authPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              items: {
                type: 'string',
                pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { ids } = request.body;

      if (!Array.isArray(ids)) {
        throw new ValidationError('ids must be an array');
      }

      // Validate all IDs are UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const id of ids) {
        if (!uuidRegex.test(id)) {
          throw new ValidationError(`Invalid session ID format: ${id}`);
        }
      }

      const deletedCount = await sessionService.bulkDeleteSessions(ids, request.user.userId);

      return reply.send({
        success: true,
        data: { deletedCount },
        requestId: String(request.id),
      });
    }
  );
}
}

export const sessionsRoutesV2 = buildSessionsRoutesV2();
