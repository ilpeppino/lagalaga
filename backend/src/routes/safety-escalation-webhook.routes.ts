import { createHmac } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
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

function getHeaderValue(headers: Record<string, unknown>, headerName: string): string | null {
  const value = headers[headerName];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

/**
 * Verify HMAC-SHA256 signature of the request body
 */
function verifySignature(body: string, expectedSignature: string, secret: string): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(body, 'utf-8');
  const computedSignature = hmac.digest('hex');

  // Constant-time comparison to prevent timing attacks
  return computedSignature.length === expectedSignature.length &&
    computedSignature === expectedSignature;
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

    fastify.post('/webhooks/safety-escalation', async (request: FastifyRequest, reply) => {
      const headers = request.headers as Record<string, unknown>;
      const clientIp = request.ip;

      // Verify bearer token
      const expectedToken = fastify.config.SAFETY_WEBHOOK_TOKEN;
      const actualToken = getHeaderValue(headers, 'x-safety-token');

      if (!expectedToken || !actualToken || actualToken !== expectedToken) {
        fastify.log.warn(
          {
            event: 'webhook_auth_failed',
            reason: !expectedToken ? 'token_not_configured' : !actualToken ? 'missing_header' : 'invalid_token',
            ip: clientIp,
            timestamp: new Date().toISOString(),
          },
          'Safety webhook authentication failed'
        );
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      // Verify HMAC signature for request body integrity
      const signatureHeader = getHeaderValue(headers, 'x-webhook-signature');
      if (!signatureHeader) {
        fastify.log.warn(
          {
            event: 'webhook_signature_missing',
            ip: clientIp,
            timestamp: new Date().toISOString(),
          },
          'Safety webhook missing signature header'
        );
        return reply.status(401).send({ success: false, error: 'Missing signature' });
      }

      // Verify signature using the raw body
      const bodyString = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      if (!verifySignature(bodyString, signatureHeader, expectedToken)) {
        fastify.log.warn(
          {
            event: 'webhook_signature_invalid',
            ip: clientIp,
            timestamp: new Date().toISOString(),
          },
          'Safety webhook signature verification failed'
        );
        return reply.status(401).send({ success: false, error: 'Invalid signature' });
      }

      // Verify timestamp to prevent replay attacks (5 minute window)
      const timestampHeader = getHeaderValue(headers, 'x-webhook-timestamp');
      if (!timestampHeader) {
        fastify.log.warn(
          {
            event: 'webhook_timestamp_missing',
            ip: clientIp,
            timestamp: new Date().toISOString(),
          },
          'Safety webhook missing timestamp header'
        );
        return reply.status(401).send({ success: false, error: 'Missing timestamp' });
      }

      const requestTimestamp = parseInt(timestampHeader, 10);
      if (Number.isNaN(requestTimestamp)) {
        fastify.log.warn(
          {
            event: 'webhook_timestamp_invalid',
            ip: clientIp,
            timestamp: new Date().toISOString(),
          },
          'Safety webhook invalid timestamp format'
        );
        return reply.status(401).send({ success: false, error: 'Invalid timestamp' });
      }

      const now = Date.now();
      const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
      if (Math.abs(now - requestTimestamp) > MAX_AGE_MS) {
        fastify.log.warn(
          {
            event: 'webhook_timestamp_expired',
            ip: clientIp,
            timestamp: new Date().toISOString(),
            age_ms: Math.abs(now - requestTimestamp),
          },
          'Safety webhook timestamp outside acceptable window'
        );
        return reply.status(401).send({ success: false, error: 'Request expired' });
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
