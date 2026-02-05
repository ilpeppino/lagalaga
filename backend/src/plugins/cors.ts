import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

export async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: fastify.config.CORS_ORIGIN === '*' ? true : fastify.config.CORS_ORIGIN,
    credentials: true,
  });
}
