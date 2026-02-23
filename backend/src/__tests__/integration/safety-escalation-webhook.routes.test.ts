import Fastify, { type FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { buildSafetyEscalationWebhookRoutes } from '../../routes/safety-escalation-webhook.routes.js';
import type { SafetyMailer } from '../../services/safetyMailer.js';

describe('Safety escalation webhook routes', () => {
  let app: FastifyInstance;
  const sendEscalation = jest.fn<SafetyMailer['sendEscalation']>();
  const originalToken = process.env.SAFETY_WEBHOOK_TOKEN;

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

    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'test-safety-token')
      .send({
        event: 'safety_report_escalated',
        reportId: 'rpt_test_123',
        category: 'CSAM',
        escalatedAt: '2026-02-23T21:00:00.000Z',
        requestId: 'req-1',
      });

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
    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'wrong-token')
      .send({
        event: 'safety_report_escalated',
        reportId: 'rpt_test_123',
        category: 'CSAM',
        escalatedAt: '2026-02-23T21:00:00.000Z',
      });

    expect(response.status).toBe(401);
    expect(sendEscalation).not.toHaveBeenCalled();
  });

  it('returns 422 for invalid payload', async () => {
    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'test-safety-token')
      .send({
        event: 'wrong_event',
        reportId: '',
        category: 'CSAM',
        escalatedAt: 'not-a-date',
      });

    expect(response.status).toBe(422);
    expect(sendEscalation).not.toHaveBeenCalled();
  });

  it('returns 200 when mail delivery fails', async () => {
    sendEscalation.mockRejectedValue(new Error('Resend unavailable'));

    const response = await request(app.server)
      .post('/webhooks/safety-escalation')
      .set('x-safety-token', 'test-safety-token')
      .send({
        event: 'safety_report_escalated',
        reportId: 'rpt_test_456',
        category: 'CSAM',
        escalatedAt: '2026-02-23T21:00:00.000Z',
      });

    expect(response.status).toBe(200);
    expect(sendEscalation).toHaveBeenCalledTimes(1);
  });
});
