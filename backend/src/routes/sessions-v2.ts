import { FastifyInstance } from 'fastify';
import { SessionServiceV2, CreateSessionInput } from '../services/sessionService-v2.js';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { getSupabase } from '../config/supabase.js';

export async function sessionsRoutesV2(fastify: FastifyInstance) {
  const sessionService = new SessionServiceV2();

  /**
   * POST /api/sessions
   * Create new session
   */
  fastify.post<{
    Body: Omit<CreateSessionInput, 'hostUserId'>;
  }>(
    '/api/sessions',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['robloxUrl', 'title'],
          properties: {
            robloxUrl: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            visibility: { type: 'string', enum: ['public', 'friends', 'invite_only'] },
            maxParticipants: { type: 'number', minimum: 2, maximum: 50 },
            scheduledStart: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { robloxUrl, title, description, visibility, maxParticipants, scheduledStart } = request.body;

      if (!robloxUrl || !title) {
        throw new ValidationError('robloxUrl and title are required');
      }

      const result = await sessionService.createSession({
        hostUserId: request.user.userId,
        robloxUrl,
        title,
        description,
        visibility,
        maxParticipants,
        scheduledStart,
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
      const result = await sessionService.listSessions({
        ...request.query,
        status: request.query.status as any,
        visibility: request.query.visibility as any,
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
      preHandler: authenticate,
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
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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

      const session = await sessionService.getSessionById(request.params.id);

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
      preHandler: authenticate,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
}
