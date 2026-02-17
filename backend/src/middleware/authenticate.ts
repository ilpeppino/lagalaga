import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthError, ErrorCodes } from '../utils/errors.js';
import { getSupabase } from '../config/supabase.js';

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (error) {
    throw new AuthError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token expired or invalid');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('app_users')
    .select('status, token_version')
    .eq('id', request.user.userId)
    .maybeSingle<{ status: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED'; token_version: number }>();

  if (error) {
    throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'User not found');
  }

  if (!data) {
    throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'User not found');
  }

  if (Number(data.token_version ?? 0) !== Number(request.user.tokenVersion ?? 0)) {
    throw new AuthError(ErrorCodes.AUTH_TOKEN_REVOKED, 'Token has been revoked');
  }

  if (data.status !== 'ACTIVE') {
    throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is not active');
  }
}
