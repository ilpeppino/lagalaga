import type { GoogleAuthService } from './google-auth.service.js';
import type { GoogleOAuthService } from './googleOAuth.js';
import type { TokenService } from './tokenService.js';
import { AuthError, ErrorCodes } from '../utils/errors.js';
import { verifySignedOAuthState } from '../utils/crypto.js';

export interface GoogleOAuthStateEntry {
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  expiresAt: number;
}

export interface CompleteGoogleOAuthInput {
  code: string;
  state: string;
}

export interface CompleteGoogleOAuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    robloxUserId: string | null;
    robloxUsername: string | null;
    robloxDisplayName: string | null;
  };
  redirectUri: string;
}

interface CompleteGoogleOAuthDeps {
  jwtSecret: string;
  googleOAuth: Pick<GoogleOAuthService, 'exchangeCode' | 'validateIdToken'>;
  googleAuthService: Pick<GoogleAuthService, 'resolveUserForGoogleLogin'>;
  tokenService: Pick<TokenService, 'generateTokens'>;
  consumeStateEntry: (state: string) => GoogleOAuthStateEntry | null;
}

export async function completeGoogleOAuth(
  input: CompleteGoogleOAuthInput,
  deps: CompleteGoogleOAuthDeps
): Promise<CompleteGoogleOAuthResult> {
  const code = input.code?.trim();
  const state = input.state?.trim();

  if (!code || !state) {
    throw new AuthError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Missing code or state');
  }

  if (!verifySignedOAuthState(state, deps.jwtSecret)) {
    throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid or expired state parameter');
  }

  const entry = deps.consumeStateEntry(state);
  if (!entry) {
    throw new AuthError(ErrorCodes.AUTH_INVALID_STATE, 'Invalid or expired state parameter');
  }

  const tokenResponse = await deps.googleOAuth.exchangeCode(code, entry.codeVerifier);
  const claims = await deps.googleOAuth.validateIdToken(tokenResponse.id_token, entry.nonce);
  const user = await deps.googleAuthService.resolveUserForGoogleLogin(claims);

  if (user.status === 'PENDING_DELETION') {
    throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is pending deletion');
  }

  if (user.status === 'DELETED') {
    throw new AuthError(ErrorCodes.AUTH_FORBIDDEN, 'Account is unavailable');
  }

  const tokens = deps.tokenService.generateTokens({
    userId: user.id,
    robloxUserId: user.robloxUserId,
    robloxUsername: user.robloxUsername,
    tokenVersion: user.tokenVersion,
  });

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: user.id,
      robloxUserId: user.robloxUserId,
      robloxUsername: user.robloxUsername,
      robloxDisplayName: user.robloxDisplayName,
    },
    redirectUri: entry.redirectUri,
  };
}
