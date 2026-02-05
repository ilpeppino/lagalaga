import { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors.js';

export async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler(
    async (error: FastifyError | AppError, _request: FastifyRequest, reply: FastifyReply) => {
      fastify.log.error(error);

      // Handle AppError instances
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
          },
        });
      }

      // Handle JWT errors
      if (error.name === 'UnauthorizedError' || error.statusCode === 401) {
        return reply.status(401).send({
          error: {
            code: 'AUTH_002',
            message: 'Token expired or invalid',
            statusCode: 401,
          },
        });
      }

      // Handle validation errors
      if (error.validation) {
        return reply.status(400).send({
          error: {
            code: 'VAL_001',
            message: 'Validation error',
            statusCode: 400,
            details: error.validation,
          },
        });
      }

      // Handle other Fastify errors
      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({
        error: {
          code: 'INT_001',
          message: fastify.config.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message,
          statusCode,
        },
      });
    }
  );
}
