import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { buildSafetyEscalationWebhookRoutes } from '../../routes/safety-escalation-webhook.routes.js';
import type { SafetyMailer } from '../../services/safetyMailer.js';

describe('Safety escalation webhook routes', () => {
  let app: FastifyInstance;
  const sendEscalation = jest.fn<SafetyMailer['sendEscalation']>();
  const originalToken = process.env.SAFETY_WEBHOOK_TOKEN;

  function signBody(body: Record<string, unknown>, token: string) {
    const bodyString = JSON.stringify(body);
    const signature = createHmac('sha256', token).update(bodyString, 'utf-8').digest('hex');
    return {
      bodyString,
      signature,
      timestamp: String(Date.now()),
    };
  }

  beforeEach(async () => {
    process.env.SAFETY_WEBHOOK_TOKEN = 'test-safety-token';
    sendEscalation.mockReset();

    app = Fastify();
    await app.register(errorHandlerPlugin);
    await app.register(buildSafetyEscalationWebhookRoutes({
      safetyMailer: { sendEscalation },
    }));
    await app.ready();
  });

  afterEach(async () => {
    process.env.SAFETY_WEBHOOK_TOKEN = originalToken;
    await app.close();
  });

  it('returns 200 and sends escalation email for valid payload', async () => {
    sendEscalation.mockResolvedValue(undefined);
    const payload = {
      event: 'safety_report_escalated',
      reportId: 'rpt_test_123',
      category: 'CSAM',
      escalatedAt: '2026-02-23T21:00:00.000Z',
      requestId: 'req-1',
    };
    const { bodyString, signature, timestamp } = signBody(payload, 'test-safety-token');

    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'test-safety-token')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('content-type', 'application/json')
      .send(bodyString);

    expect(response.status).toBe(200);
    expect(sendEscalation).toHaveBeenCalledWith({
      event: 'safety_report_escalated',
      reportId: 'rpt_test_123',
      category: 'CSAM',
      escalatedAt: '2026-02-23T21:00:00.000Z',
      requestId: 'req-1',
    });
  });

  it('returns 401 when token is missing or invalid', async () => {
    const payload = {
      event: 'safety_report_escalated',
      reportId: 'rpt_test_123',
      category: 'CSAM',
      escalatedAt: '2026-02-23T21:00:00.000Z',
    };
    const { bodyString, signature, timestamp } = signBody(payload, 'test-safety-token');

    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'wrong-token')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('content-type', 'application/json')
      .send(bodyString);

    expect(response.status).toBe(401);
    expect(sendEscalation).not.toHaveBeenCalled();
  });

  it('returns 422 for invalid payload', async () => {
    const payload = {
      event: 'wrong_event',
      reportId: '',
      category: 'CSAM',
      escalatedAt: 'not-a-date',
    };
    const { bodyString, signature, timestamp } = signBody(payload, 'test-safety-token');

    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'test-safety-token')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('content-type', 'application/json')
      .send(bodyString);

    expect(response.status).toBe(422);
    expect(sendEscalation).not.toHaveBeenCalled();
  });

  it('returns 200 when mail delivery fails', async () => {
    sendEscalation.mockRejectedValue(new Error('Resend unavailable'));
    const payload = {
      event: 'safety_report_escalated',
      reportId: 'rpt_test_456',
      category: 'CSAM',
      escalatedAt: '2026-02-23T21:00:00.000Z',
    };
    const { bodyString, signature, timestamp } = signBody(payload, 'test-safety-token');

    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'test-safety-token')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('content-type', 'application/json')
      .send(bodyString);

    expect(response.status).toBe(200);
    expect(sendEscalation).toHaveBeenCalledTimes(1);
  });
});
