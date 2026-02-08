import { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, ErrorCodes } from '../utils/errors.js';
import type { ErrorSeverity } from '../../../shared/errors/codes.js';
import { logError } from '../lib/logger.js';

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    severity: ErrorSeverity;
    requestId: string;
    details?: unknown;
  };
}

function buildErrorResponse(
  code: string,
  message: string,
  statusCode: number,
  severity: ErrorSeverity,
  requestId: string,
  details?: unknown
): ErrorResponseBody {
  return {
    success: false,
    error: {
      code,
      message,
      statusCode,
      severity,
      requestId,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler(
    async (error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
      const requestId = String(request.id || '');
      const isProduction = fastify.config.NODE_ENV === 'production';

      // Handle AppError instances (our domain errors)
      if (error instanceof AppError) {
        logError(error, { requestId, severity: error.severity }, `[${error.code}] ${error.message}`);

        return reply.status(error.statusCode).send(
          buildErrorResponse(
            error.code,
            error.message,
            error.statusCode,
            error.severity,
            requestId,
          )
        );
      }

      // Handle JWT / auth errors
      if (error.name === 'UnauthorizedError' || error.statusCode === 401) {
        logError(error, { requestId }, 'Unauthorized');

        return reply.status(401).send(
          buildErrorResponse(
            ErrorCodes.AUTH_TOKEN_EXPIRED,
            'Token expired or invalid',
            401,
            'warning',
            requestId,
          )
        );
      }

      // Handle Fastify validation errors
      if ((error as FastifyError).validation) {
        logError(error, { requestId }, 'Validation error');

        return reply.status(400).send(
          buildErrorResponse(
            ErrorCodes.VALIDATION_ERROR,
            'Validation error',
            400,
            'warning',
            requestId,
            (error as FastifyError).validation,
          )
        );
      }

      // Handle all other errors
      const statusCode = error.statusCode || 500;
      const severity: ErrorSeverity = statusCode >= 500 ? 'error' : 'warning';

      logError(error, { requestId, statusCode }, 'Unhandled error');

      return reply.status(statusCode).send(
        buildErrorResponse(
          ErrorCodes.INTERNAL_ERROR,
          isProduction ? 'Internal server error' : error.message,
          statusCode,
          severity,
          requestId,
        )
      );
    }
  );
}
