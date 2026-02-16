import type { FastifyInstance } from 'fastify';

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function isCompetitiveDepthEnabled(fastify?: FastifyInstance): boolean {
  if (fastify) {
    return fastify.config.ENABLE_COMPETITIVE_DEPTH === true;
  }

  return parseBooleanEnv(process.env.ENABLE_COMPETITIVE_DEPTH);
}
