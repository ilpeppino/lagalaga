import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthError, ErrorCodes } from '../utils/errors.js';

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (error) {
    throw new AuthError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token expired or invalid');
  }
}
