import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
const mockSetUser = jest.fn();
const mockAddBreadcrumb = jest.fn();

jest.unstable_mockModule('@sentry/node', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  setUser: mockSetUser,
  addBreadcrumb: mockAddBreadcrumb,
  init: jest.fn(),
}));

const { SentryMonitoringProvider } = await import('../sentryMonitoringProvider.js');

describe('SentryMonitoringProvider', () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
    mockCaptureMessage.mockReset();
    mockSetUser.mockReset();
    mockAddBreadcrumb.mockReset();
  });

  it('sanitizes sensitive context before captureException', () => {
    const provider = new SentryMonitoringProvider();
    const error = new Error('Boom');

    provider.captureError(error, {
      token: 'abc123',
      nested: { refresh_token: 'xyz456' },
      safeValue: 'ok',
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        extra: expect.objectContaining({
          token: '[REDACTED]',
          nested: expect.objectContaining({ refresh_token: '[REDACTED]' }),
          safeValue: 'ok',
        }),
      })
    );
  });

  it('forwards messages and breadcrumbs', () => {
    const provider = new SentryMonitoringProvider();

    provider.captureMessage('hello', 'warning');
    provider.addBreadcrumb({
      category: 'user',
      message: 'Login started',
      level: 'info',
      data: { authorization: 'secret' },
    });

    expect(mockCaptureMessage).toHaveBeenCalledWith('hello', 'warning');
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'user',
        message: 'Login started',
        data: expect.objectContaining({ authorization: '[REDACTED]' }),
      })
    );
  });
});
