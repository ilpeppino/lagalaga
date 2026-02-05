import { FastifyInstance } from 'fastify';
import { SessionService, CreateSessionInput } from '../services/sessionService.js';
import { authenticate } from '../middleware/authenticate.js';
import { SessionError, ErrorCodes } from '../utils/errors.js';

export async function sessionsRoutes(fastify: FastifyInstance) {
  const sessionService = new SessionService();

  /**
   * GET /sessions
   * List upcoming sessions
   */
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
    };
  }>('/sessions', {
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
  }, async (request) => {
    const { limit, offset } = request.query;
    const result = await sessionService.listUpcoming({ limit, offset });
    return result;
  });

  /**
   * POST /sessions
   * Create new session
   */
  fastify.post<{
    Body: Omit<CreateSessionInput, 'hostUserId'>;
  }>('/sessions', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['gameName', 'gameUrl', 'startTimeUtc', 'maxPlayers', 'sessionType'],
        properties: {
          gameName: { type: 'string' },
          gameUrl: { type: 'string' },
          title: { type: 'string' },
          startTimeUtc: { type: 'string' },
          durationMinutes: { type: 'number' },
          maxPlayers: { type: 'number' },
          sessionType: { type: 'string', enum: ['casual', 'ranked', 'tournament', 'practice'] },
          visibility: { type: 'string', enum: ['public', 'friends', 'private'] },
        },
      },
    },
  }, async (request) => {
    const session = await sessionService.createSession({
      ...request.body,
      hostUserId: request.user.userId,
    });
    return { session };
  });

  /**
   * GET /sessions/:id
   * Get session details
   */
  fastify.get<{
    Params: { id: string };
  }>('/sessions/:id', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const result = await sessionService.getSessionById(request.params.id);
    if (!result) {
      throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
    }
    return result;
  });

  /**
   * POST /sessions/:id/join
   * Join session
   */
  fastify.post<{
    Params: { id: string };
  }>('/sessions/:id/join', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const participant = await sessionService.joinSession(request.params.id, request.user.userId);
    return { participant };
  });

  /**
   * POST /sessions/:id/leave
   * Leave session
   */
  fastify.post<{
    Params: { id: string };
  }>('/sessions/:id/leave', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    await sessionService.leaveSession(request.params.id, request.user.userId);
    reply.status(204).send();
  });
}
