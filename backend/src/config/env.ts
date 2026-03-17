import type { FastifyInstance } from 'fastify';

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
    'OAUTH_ENCRYPTION_KEY',
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
    SUPABASE_ANON_KEY: {
      type: 'string',
      default: '',
    },
    DB_PROVIDER: {
      type: 'string',
      default: 'supabase',
    },
    POSTGRES_HOST: {
      type: 'string',
      default: '',
    },
    POSTGRES_PORT: {
      type: 'number',
      default: 5433,
    },
    POSTGRES_DB: {
      type: 'string',
      default: '',
    },
    POSTGRES_USER: {
      type: 'string',
      default: '',
    },
    POSTGRES_PASSWORD: {
      type: 'string',
      default: '',
    },
    POSTGRES_SSL: {
      type: 'boolean',
      default: false,
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
    GOOGLE_CLIENT_ID: {
      type: 'string',
      default: '',
    },
    GOOGLE_CLIENT_SECRET: {
      type: 'string',
      default: '',
    },
    GOOGLE_REDIRECT_URI: {
      type: 'string',
      default: '',
    },
    GOOGLE_ISSUER: {
      type: 'string',
      default: 'https://accounts.google.com',
    },
    GOOGLE_JWKS_URI: {
      type: 'string',
      default: '',
    },
    APPLE_BUNDLE_ID: {
      type: 'string',
      default: '',
    },
    APPLE_AUDIENCE: {
      type: 'string',
      default: '',
    },
    APPLE_ISSUER: {
      type: 'string',
      default: 'https://appleid.apple.com',
    },
    APPLE_JWKS_URI: {
      type: 'string',
      default: '',
    },
    JWT_SECRET: {
      type: 'string',
    },
    OAUTH_ENCRYPTION_KEY: {
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
      default: '',
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
    ACCOUNT_DELETION_GRACE_DAYS: {
      type: 'number',
      default: 7,
    },
    ACCOUNT_PURGE_INTERVAL_MINUTES: {
      type: 'number',
      default: 60,
    },
    ACCOUNT_PURGE_ENABLED: {
      type: 'boolean',
      default: true,
    },
    SESSION_LIFECYCLE_ENABLED: {
      type: 'boolean',
      default: true,
    },
    SESSION_LIFECYCLE_INTERVAL_MINUTES: {
      type: 'number',
      default: 15,
    },
    SESSION_AUTO_COMPLETE_AFTER_HOURS: {
      type: 'number',
      default: 2,
    },
    SESSION_COMPLETED_RETENTION_HOURS: {
      type: 'number',
      default: 2,
    },
    SESSION_LIFECYCLE_BATCH_SIZE: {
      type: 'number',
      default: 200,
    },
    CACHE_CLEANUP_ENABLED: {
      type: 'boolean',
      default: true,
    },
    CACHE_CLEANUP_INTERVAL_HOURS: {
      type: 'number',
      default: 6,
    },
    SAFETY_ALERT_WEBHOOK_URL: {
      type: 'string',
      default: '',
    },
    SAFETY_WEBHOOK_TOKEN: {
      type: 'string',
      default: '',
    },
    METRICS_BEARER_TOKEN: {
      type: 'string',
      default: '',
    },
    SAFETY_ESCALATE_GROOMING: {
      type: 'boolean',
      default: false,
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
      SUPABASE_ANON_KEY: string;
      DB_PROVIDER: 'supabase' | 'postgres';
      POSTGRES_HOST: string;
      POSTGRES_PORT: number;
      POSTGRES_DB: string;
      POSTGRES_USER: string;
      POSTGRES_PASSWORD: string;
      POSTGRES_SSL: boolean;
      ROBLOX_CLIENT_ID: string;
      ROBLOX_CLIENT_SECRET: string;
      ROBLOX_REDIRECT_URI: string;
      GOOGLE_CLIENT_ID: string;
      GOOGLE_CLIENT_SECRET: string;
      GOOGLE_REDIRECT_URI: string;
      GOOGLE_ISSUER: string;
      GOOGLE_JWKS_URI: string;
      APPLE_BUNDLE_ID: string;
      APPLE_AUDIENCE: string;
      APPLE_ISSUER: string;
      APPLE_JWKS_URI: string;
      JWT_SECRET: string;
      OAUTH_ENCRYPTION_KEY: string;
      JWT_EXPIRY: string;
      REFRESH_TOKEN_SECRET: string;
      REFRESH_TOKEN_EXPIRY: string;
      CORS_ORIGIN: string;
      FEATURE_FRIENDS_ENABLED: boolean;
      ENABLE_COMPETITIVE_DEPTH: boolean;
      DEFAULT_PLACE_ID?: number;
      ACCOUNT_DELETION_GRACE_DAYS: number;
      ACCOUNT_PURGE_INTERVAL_MINUTES: number;
      ACCOUNT_PURGE_ENABLED: boolean;
      SESSION_LIFECYCLE_ENABLED: boolean;
      SESSION_LIFECYCLE_INTERVAL_MINUTES: number;
      SESSION_AUTO_COMPLETE_AFTER_HOURS: number;
      SESSION_COMPLETED_RETENTION_HOURS: number;
      SESSION_LIFECYCLE_BATCH_SIZE: number;
      CACHE_CLEANUP_ENABLED: boolean;
      CACHE_CLEANUP_INTERVAL_HOURS: number;
      SAFETY_ALERT_WEBHOOK_URL: string;
      SAFETY_WEBHOOK_TOKEN: string;
      METRICS_BEARER_TOKEN: string;
      SAFETY_ESCALATE_GROOMING: boolean;
    };
  }
}

export function validateEnvForRuntime(config: FastifyInstance['config']): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  const requiredInProduction: Array<keyof FastifyInstance['config']> = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_REDIRECT_URI',
    'SAFETY_WEBHOOK_TOKEN',
    'METRICS_BEARER_TOKEN',
  ];

  for (const key of requiredInProduction) {
    if (typeof config[key] !== 'string' || config[key].trim().length === 0) {
      throw new Error(`${String(key)} must be configured in production`);
    }
  }

  if (config.APPLE_BUNDLE_ID.trim().length === 0 && config.APPLE_AUDIENCE.trim().length === 0) {
    throw new Error('APPLE_BUNDLE_ID or APPLE_AUDIENCE must be configured in production');
  }
}
