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
      default: '',
    },
    RATE_LIMIT_ENABLED: {
      type: 'boolean',
      default: true,
    },
    RATE_LIMIT_MAX: {
      type: 'number',
      default: 600,
    },
    RATE_LIMIT_TIME_WINDOW: {
      type: 'string',
      default: '1 minute',
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
    SESSION_REMINDER_ENABLED: {
      type: 'boolean',
      default: true,
    },
    SESSION_REMINDER_INTERVAL_MINUTES: {
      type: 'number',
      default: 1,
    },
    SESSION_REMINDER_LEAD_MINUTES: {
      type: 'number',
      default: 10,
    },
    SESSION_REMINDER_WINDOW_SECONDS: {
      type: 'number',
      default: 60,
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
    SENTRY_DSN: {
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
      ROBLOX_CLIENT_ID: string;
      ROBLOX_CLIENT_SECRET: string;
      ROBLOX_REDIRECT_URI: string;
      JWT_SECRET: string;
      JWT_EXPIRY: string;
      REFRESH_TOKEN_SECRET: string;
      REFRESH_TOKEN_EXPIRY: string;
      CORS_ORIGIN: string;
      RATE_LIMIT_ENABLED: boolean;
      RATE_LIMIT_MAX: number;
      RATE_LIMIT_TIME_WINDOW: string;
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
      SESSION_REMINDER_ENABLED: boolean;
      SESSION_REMINDER_INTERVAL_MINUTES: number;
      SESSION_REMINDER_LEAD_MINUTES: number;
      SESSION_REMINDER_WINDOW_SECONDS: number;
      CACHE_CLEANUP_ENABLED: boolean;
      CACHE_CLEANUP_INTERVAL_HOURS: number;
      SAFETY_ALERT_WEBHOOK_URL: string;
      SENTRY_DSN: string;
      METRICS_BEARER_TOKEN: string;
      SAFETY_ESCALATE_GROOMING: boolean;
    };
  }
}
