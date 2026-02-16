export const envSchema = {
  type: 'object',
  required: [
    'NODE_ENV',
    'PORT',
    'HOST',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ROBLOX_CLIENT_ID',
    'ROBLOX_CLIENT_SECRET',
    'ROBLOX_REDIRECT_URI',
    'JWT_SECRET',
    'REFRESH_TOKEN_SECRET',
  ],
  properties: {
    NODE_ENV: {
      type: 'string',
      default: 'development',
    },
    PORT: {
      type: 'number',
      default: 3001,
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0',
    },
    SUPABASE_URL: {
      type: 'string',
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      type: 'string',
    },
    ROBLOX_CLIENT_ID: {
      type: 'string',
    },
    ROBLOX_CLIENT_SECRET: {
      type: 'string',
    },
    ROBLOX_REDIRECT_URI: {
      type: 'string',
    },
    JWT_SECRET: {
      type: 'string',
    },
    JWT_EXPIRY: {
      type: 'string',
      default: '15m',
    },
    REFRESH_TOKEN_SECRET: {
      type: 'string',
    },
    REFRESH_TOKEN_EXPIRY: {
      type: 'string',
      default: '7d',
    },
    CORS_ORIGIN: {
      type: 'string',
      default: '*',
    },
    FEATURE_FRIENDS_ENABLED: {
      type: 'boolean',
      default: true,
    },
    ENABLE_COMPETITIVE_DEPTH: {
      type: 'boolean',
      default: false,
    },
    DEFAULT_PLACE_ID: {
      type: 'number',
      default: undefined,
    },
  },
};

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      NODE_ENV: string;
      PORT: number;
      HOST: string;
      SUPABASE_URL: string;
      SUPABASE_SERVICE_ROLE_KEY: string;
      ROBLOX_CLIENT_ID: string;
      ROBLOX_CLIENT_SECRET: string;
      ROBLOX_REDIRECT_URI: string;
      JWT_SECRET: string;
      JWT_EXPIRY: string;
      REFRESH_TOKEN_SECRET: string;
      REFRESH_TOKEN_EXPIRY: string;
      CORS_ORIGIN: string;
      FEATURE_FRIENDS_ENABLED: boolean;
      ENABLE_COMPETITIVE_DEPTH: boolean;
      DEFAULT_PLACE_ID?: number;
    };
  }
}
