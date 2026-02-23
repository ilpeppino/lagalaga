import type { FastifyInstance } from 'fastify';
import { createSafetyMailer, type SafetyEscalationPayload, type SafetyMailer } from '../services/safetyMailer.js';

interface SafetyEscalationWebhookDeps {
  safetyMailer?: SafetyMailer;
}

interface InvalidPayloadResult {
  error: string;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getHeaderToken(headers: Record<string, unknown>): string | null {
  const tokenHeader = headers['x-safety-token'];
  if (typeof tokenHeader === 'string') return tokenHeader;
  if (Array.isArray(tokenHeader) && typeof tokenHeader[0] === 'string') return tokenHeader[0];
  return null;
}

function validatePayload(body: unknown): SafetyEscalationPayload | InvalidPayloadResult {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object' };
  }

  const payload = body as Record<string, unknown>;
  const event = asNonEmptyString(payload.event);
  const reportId = asNonEmptyString(payload.reportId);
  const category = asNonEmptyString(payload.category);
  const escalatedAt = asNonEmptyString(payload.escalatedAt);
  const requestIdRaw = payload.requestId;
  const requestId =
    requestIdRaw === undefined
      ? undefined
      : asNonEmptyString(requestIdRaw);

  if (event !== 'safety_report_escalated') {
    return { error: 'event must be "safety_report_escalated"' };
  }

  if (!reportId) {
    return { error: 'reportId is required' };
  }

  if (!category) {
    return { error: 'category is required' };
  }

  if (!escalatedAt || Number.isNaN(Date.parse(escalatedAt))) {
    return { error: 'escalatedAt must be a valid ISO timestamp' };
  }

  if (requestIdRaw !== undefined && !requestId) {
    return { error: 'requestId must be a non-empty string when provided' };
  }

  return {
    event: 'safety_report_escalated',
    reportId,
    category,
    escalatedAt,
    ...(requestId ? { requestId } : {}),
  };
}

export function buildSafetyEscalationWebhookRoutes(deps: SafetyEscalationWebhookDeps = {}) {
  return async function safetyEscalationWebhookRoutes(fastify: FastifyInstance) {
    const safetyMailer = deps.safetyMailer ?? createSafetyMailer();

    fastify.post('/webhooks/safety-escalation', async (request, reply) => {
      const expectedToken = process.env.SAFETY_WEBHOOK_TOKEN ?? '';
      const actualToken = getHeaderToken(request.headers as Record<string, unknown>);

      if (!expectedToken || !actualToken || actualToken !== expectedToken) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const validationResult = validatePayload(request.body);
      if ('error' in validationResult) {
        return reply.status(422).send({ success: false, error: validationResult.error });
      }

      try {
        await safetyMailer.sendEscalation(validationResult);
        fastify.log.info(
          {
            type: 'safety_notification_sent',
            reportId: validationResult.reportId,
            category: validationResult.category,
            requestId: validationResult.requestId,
          },
          'Safety escalation email sent'
        );
      } catch (error) {
        fastify.log.error(
          {
            type: 'safety_notification_failed',
            reportId: validationResult.reportId,
            category: validationResult.category,
            escalatedAt: validationResult.escalatedAt,
            requestId: validationResult.requestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Safety escalation email failed'
        );
      }

      return reply.status(200).send({ success: true });
    });
  };
}

export const safetyEscalationWebhookRoutes = buildSafetyEscalationWebhookRoutes();
