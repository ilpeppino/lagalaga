import { Resend } from 'resend';

export interface SafetyEscalationPayload {
  event: 'safety_report_escalated';
  reportId: string;
  category: string;
  escalatedAt: string;
  requestId?: string;
}

export interface SafetyMailer {
  sendEscalation(payload: SafetyEscalationPayload): Promise<void>;
}

interface ResendSafetyMailerConfig {
  apiKey?: string;
  to?: string;
  from?: string;
  appEnv?: string;
  resendClient?: Resend;
}

export class ResendSafetyMailer implements SafetyMailer {
  private readonly apiKey: string;
  private readonly to: string;
  private readonly from: string;
  private readonly appEnv: string;
  private resendClient: Resend | undefined;

  constructor(config: ResendSafetyMailerConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.RESEND_API_KEY ?? '';
    this.to = config.to ?? process.env.SAFETY_MAIL_TO ?? '';
    this.from = config.from ?? process.env.SAFETY_MAIL_FROM ?? '';
    this.appEnv = config.appEnv ?? process.env.APP_ENV ?? '';
    this.resendClient = config.resendClient;
  }

  async sendEscalation(payload: SafetyEscalationPayload): Promise<void> {
    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    if (!this.to) {
      throw new Error('SAFETY_MAIL_TO is not configured');
    }
    if (!this.from) {
      throw new Error('SAFETY_MAIL_FROM is not configured');
    }

    const resend = this.getResendClient();
    const subject = buildSubject(payload.category, this.appEnv);
    const text = buildBody(payload, this.appEnv);

    const response = await resend.emails.send({
      from: this.from,
      to: this.to,
      subject,
      text,
    });

    if (response.error) {
      throw new Error(response.error.message || 'Resend returned an unknown error');
    }
  }

  private getResendClient(): Resend {
    if (!this.resendClient) {
      this.resendClient = new Resend(this.apiKey);
    }

    return this.resendClient;
  }
}

function buildSubject(category: string, appEnv: string): string {
  const normalized = appEnv.trim().toUpperCase();
  const envLabel = normalized === 'PRODUCTION' ? 'PROD' : normalized;

  if (envLabel) {
    return `[${envLabel}] SAFETY ESCALATION: ${category}`;
  }

  return `SAFETY ESCALATION: ${category}`;
}

function buildBody(payload: SafetyEscalationPayload, appEnv: string): string {
  return [
    `Event: ${payload.event}`,
    `Category: ${payload.category}`,
    `Report ID: ${payload.reportId}`,
    `Escalated at: ${payload.escalatedAt}`,
    `Environment: ${appEnv || 'unknown'}`,
    payload.requestId ? `Request ID: ${payload.requestId}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function createSafetyMailer(): SafetyMailer {
  return new ResendSafetyMailer();
}
