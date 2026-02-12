import { FastifyInstance } from 'fastify';
import { RobloxLinkNormalizer } from '../services/roblox-link-normalizer.js';
import { authenticate } from '../middleware/authenticate.js';
import { RobloxExperienceResolverService } from '../services/roblox-experience-resolver.js';

export async function robloxRoutes(fastify: FastifyInstance) {
  const normalizer = new RobloxLinkNormalizer();
  const experienceResolver = new RobloxExperienceResolverService();

  /**
   * POST /roblox/normalize-link
   * Normalize a Roblox link to extract placeId and canonical URLs
   */
  fastify.post<{
    Body: {
      url: string;
    };
  }>(
    '/roblox/normalize-link',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  placeId: { type: 'number' },
                  canonicalWebUrl: { type: 'string' },
                  canonicalStartUrl: { type: 'string' },
                  originalInputUrl: { type: 'string' },
                  normalizedFrom: { type: 'string' },
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
      const { url } = request.body;

      if (!url || typeof url !== 'string') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'URL is required and must be a string',
          },
        });
      }

      try {
        const result = await normalizer.normalize(url);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error) {
        fastify.log.error({ error, url }, 'Failed to normalize Roblox link');

        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_URL',
            message: error instanceof Error ? error.message : 'Unable to extract placeId from URL',
          },
        });
      }
    }
  );

  /**
   * POST /roblox/resolve-experience
   * Resolve placeId/universeId/name from a pasted Roblox experience URL.
   */
  fastify.post<{
    Body: {
      url: string;
    };
  }>(
    '/roblox/resolve-experience',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              placeId: { type: 'number' },
              universeId: { type: 'number' },
              gameName: { type: 'string' },
              canonicalUrl: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const correlationIdHeader = request.headers['x-correlation-id'];
      const correlationId =
        typeof correlationIdHeader === 'string' ? correlationIdHeader : undefined;
      const resolved = await experienceResolver.resolveExperienceFromUrl(
        request.body.url,
        correlationId
      );
      return reply.send(resolved);
    }
  );
}
