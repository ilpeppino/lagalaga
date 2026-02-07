import { FastifyInstance } from 'fastify';
import { SessionServiceV2, CreateSessionInput } from '../services/sessionService-v2.js';
import { authenticate } from '../middleware/authenticate.js';
import { SessionError } from '../utils/errors.js';
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
            scheduledStart: { type: 'string' }, // ISO 8601 timestamp
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  session: { type: 'object' },
                  inviteLink: { type: 'string' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { robloxUrl, title, description, visibility, maxParticipants, scheduledStart } = request.body;

      // Validate inputs
      if (!robloxUrl || !title) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'robloxUrl and title are required',
          },
        });
      }

      try {
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
        });
      } catch (error) {
        fastify.log.error({ error, body: request.body }, 'Failed to create session');

        return reply.status(500).send({
          success: false,
          error: {
            code: 'CREATE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to create session',
          },
        });
      }
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
      try {
        const result = await sessionService.listSessions({
          ...request.query,
          status: request.query.status as any,
          visibility: request.query.visibility as any,
        });

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to list sessions');

        return reply.status(500).send({
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Failed to list sessions',
          },
        });
      }
    }
  );

  /**
   * GET /api/sessions/:id
   * Get session details
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
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await sessionService.getSessionById(request.params.id);

        if (!session) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Session not found',
            },
          });
        }

        return reply.send({
          success: true,
          data: { session },
        });
      } catch (error) {
        fastify.log.error({ error, sessionId: request.params.id }, 'Failed to get session');

        return reply.status(500).send({
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Failed to get session',
          },
        });
      }
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
            id: { type: 'string' },
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
      try {
        const result = await sessionService.joinSession(
          request.params.id,
          request.user.userId,
          request.body.inviteCode
        );

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error) {
        fastify.log.error({ error, sessionId: request.params.id, userId: request.user.userId }, 'Failed to join session');

        if (error instanceof SessionError) {
          return reply.status(error.statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        return reply.status(500).send({
          success: false,
          error: {
            code: 'JOIN_FAILED',
            message: error instanceof Error ? error.message : 'Failed to join session',
          },
        });
      }
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
      try {
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
          return reply.status(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Invite not found',
            },
          });
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
        });
      } catch (error) {
        fastify.log.error({ error, code: request.params.code }, 'Failed to get invite');

        return reply.status(500).send({
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Failed to get invite',
          },
        });
      }
    }
  );
}
