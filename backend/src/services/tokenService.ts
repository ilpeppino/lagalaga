import { FastifyInstance } from 'fastify';

export interface TokenPayload {
  userId: string;
  robloxUserId: string;
  robloxUsername: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class TokenService {
  constructor(private fastify: FastifyInstance) {}

  generateTokens(payload: TokenPayload): TokenPair {
    const accessToken = this.fastify.jwt.sign(
      {
        userId: payload.userId,
        robloxUserId: payload.robloxUserId,
        robloxUsername: payload.robloxUsername,
      },
      {
        iss: 'lagalaga-api',
        aud: 'lagalaga-app',
      }
    );

    // Use JWT namespace "refresh" (registered in authPlugin) for refresh tokens.
    const refreshToken = (this.fastify.jwt as any).refresh.sign(
      {
        userId: payload.userId,
        robloxUserId: payload.robloxUserId,
      },
      {
        iss: 'lagalaga-api',
        aud: 'lagalaga-app',
      }
    );

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token: string): TokenPayload {
    const payload = this.fastify.jwt.verify(token) as any;
    return {
      userId: payload.userId as string,
      robloxUserId: payload.robloxUserId as string,
      robloxUsername: payload.robloxUsername as string,
    };
  }

  verifyRefreshToken(token: string): { userId: string; robloxUserId: string } {
    const payload = (this.fastify.jwt as any).refresh.verify(token);
    return {
      userId: payload.userId,
      robloxUserId: payload.robloxUserId,
    };
  }
}
