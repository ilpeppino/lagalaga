import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../lib/monitoring.js', () => ({
  monitoring: {
    captureError: jest.fn(),
  },
}));

jest.mock('../../lib/logger.js', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

// Mock fastify.config accessed inside the plugin
import Fastify from 'fastify';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { monitoring } from '../../lib/monitoring.js';

const mockCaptureError = monitoring.captureError as jest.MockedFunction<typeof monitoring.captureError>;

async function buildApp() {
  const app = Fastify();
  // Minimal config mock required by errorHandlerPlugin
  app.decorate('config', { NODE_ENV: 'test' } as any);
  await app.register(errorHandlerPlugin);
  return app;
}

describe('errorHandlerPlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls monitoring.captureError for 500 unhandled errors', async () => {
    const app = await buildApp();
    app.get('/boom', async () => { throw new Error('kaboom'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(500);
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    const [capturedError, context] = mockCaptureError.mock.calls[0] as [Error, Record<string, unknown>];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.message).toBe('kaboom');
    expect((context as any).level).toBe('error');
    expect((context as any).extra).toMatchObject({ method: 'GET' });
  });

  it('does not call monitoring.captureError for 4xx errors', async () => {
    const app = await buildApp();
    const { AppError, ErrorCodes } = await import('../../utils/errors.js');
    app.get('/notfound', async () => { throw new AppError(ErrorCodes.NOT_FOUND, 'not found', 404); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/notfound' });

    expect(res.statusCode).toBe(404);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
