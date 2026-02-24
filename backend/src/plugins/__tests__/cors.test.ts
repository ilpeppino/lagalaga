import { describe, expect, it, jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import { corsPlugin } from '../cors.js';

function buildFastifyMock(config: { CORS_ORIGIN: string; NODE_ENV: string }) {
  return {
    config,
    register: jest.fn(async () => undefined),
  } as unknown as FastifyInstance & {
    register: jest.Mock;
  };
}

describe('corsPlugin', () => {
  it('throws on wildcard origin in production', async () => {
    const fastify = buildFastifyMock({
      CORS_ORIGIN: '*',
      NODE_ENV: 'production',
    });

    await expect(corsPlugin(fastify)).rejects.toThrow(
      'Invalid CORS_ORIGIN for production. Set one or more explicit origins (comma-separated), never "*".'
    );
  });

  it('throws on empty origin in production', async () => {
    const fastify = buildFastifyMock({
      CORS_ORIGIN: '',
      NODE_ENV: 'production',
    });

    await expect(corsPlugin(fastify)).rejects.toThrow(
      'Invalid CORS_ORIGIN for production. Set one or more explicit origins (comma-separated), never "*".'
    );
  });

  it('registers explicit origins when configured', async () => {
    const fastify = buildFastifyMock({
      CORS_ORIGIN: 'https://app.example.com, https://www.example.com',
      NODE_ENV: 'production',
    });

    await corsPlugin(fastify);

    expect(fastify.register).toHaveBeenCalledTimes(1);
    expect(fastify.register).toHaveBeenCalledWith(expect.any(Function), {
      origin: ['https://app.example.com', 'https://www.example.com'],
      credentials: true,
    });
  });
});
