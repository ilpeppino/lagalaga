import { createReportRepository } from '../db/repository-factory.js';
import { logger } from '../lib/logger.js';
import {
  AppError,
  ConflictError,
  ErrorCodes,
  RateLimitError,
  ValidationError,
} from '../utils/errors.js';
import type {
  RecentReportRow,
  ReportCategory,
  ReportRepository,
  ReportStatus,
  ReportTargetType,
} from '../db/repositories/report.repository.js';

export const REPORT_CATEGORIES = [
  'CSAM',
  'GROOMING_OR_SEXUAL_EXPLOITATION',
  'HARASSMENT_OR_ABUSIVE_BEHAVIOR',
  'IMPERSONATION',
  'OTHER',
] as const;

export const REPORT_TARGET_TYPES = ['USER', 'SESSION', 'GENERAL'] as const;

interface CreateReportInput {
  reporterId: string;
  category: ReportCategory;
  description: string;
  targetType: ReportTargetType;
  targetUserId?: string;
  targetSessionId?: string;
  requestId: string;
  correlationId?: string;
}

type SupportedReportCategory = (typeof REPORT_CATEGORIES)[number];
type SupportedReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

interface ServiceOptions {
  maxReportsPerHour?: number;
  duplicateWindowMinutes?: number;
  safetyAlertWebhookUrl?: string | null;
  safetyWebhookToken?: string | null;
  escalateGrooming?: boolean;
  fetchImpl?: typeof fetch;
}

export class ReportingService {
  private reportRepositoryInstance: ReportRepository | null = null;
  private readonly maxReportsPerHour: number;
  private readonly duplicateWindowMinutes: number;
  private readonly safetyAlertWebhookUrl: string | null;
  private readonly safetyWebhookToken: string;
  private readonly escalateGrooming: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ServiceOptions = {}) {
    this.maxReportsPerHour = options.maxReportsPerHour ?? 5;
    this.duplicateWindowMinutes = options.duplicateWindowMinutes ?? 5;
    this.safetyAlertWebhookUrl = options.safetyAlertWebhookUrl ?? process.env.SAFETY_ALERT_WEBHOOK_URL ?? null;
    this.safetyWebhookToken = options.safetyWebhookToken ?? process.env.SAFETY_WEBHOOK_TOKEN ?? '';
    this.escalateGrooming = options.escalateGrooming ?? process.env.SAFETY_ESCALATE_GROOMING === 'true';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private get reportRepository(): ReportRepository {
    if (!this.reportRepositoryInstance) {
      this.reportRepositoryInstance = createReportRepository();
    }
    return this.reportRepositoryInstance;
  }

  async createReport(input: CreateReportInput): Promise<{ ticketId: string; status: ReportStatus; createdAt: string }> {
    this.validateInput(input);
    await this.ensureTargetExists(input);
    await this.enforceRateLimit(input.reporterId);
    await this.enforceDuplicateWindow(input);

    const status: ReportStatus = this.requiresEscalation(input.category) ? 'ESCALATED' : 'OPEN';
    const description = input.description.trim();
    const { data, error } = await this.reportRepository.insertReport({
      reporterId: input.reporterId,
      targetUserId: input.targetType === 'USER' ? input.targetUserId! : null,
      targetSessionId: input.targetType === 'SESSION' ? input.targetSessionId! : null,
      category: input.category,
      description,
      status,
    });

    if (error || !data) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to create safety report: ${error?.message ?? 'unknown error'}`);
    }

    logger.info(
      {
        type: 'safety_report',
        event: 'submitted',
        requestId: input.requestId,
        correlationId: input.correlationId,
        reportId: data.id,
        reporterId: input.reporterId,
        category: input.category,
        targetType: input.targetType,
        targetUserId: input.targetType === 'USER' ? input.targetUserId : null,
        targetSessionId: input.targetType === 'SESSION' ? input.targetSessionId : null,
        descriptionLength: description.length,
      },
      'Safety report submitted'
    );

    if (status === 'ESCALATED') {
      await this.notifySafetyMailbox(data.id, input.category);
    }

    return {
      ticketId: data.id,
      status: data.status,
      createdAt: data.created_at,
    };
  }

  private validateInput(input: CreateReportInput): void {
    if (!REPORT_CATEGORIES.includes(input.category as SupportedReportCategory)) {
      throw new ValidationError('Invalid report category');
    }

    if (!REPORT_TARGET_TYPES.includes(input.targetType as SupportedReportTargetType)) {
      throw new ValidationError('Invalid report target type');
    }

    if (!input.description || input.description.trim().length === 0) {
      throw new ValidationError('Description is required');
    }

    if (input.targetType === 'USER') {
      if (!input.targetUserId) {
        throw new ValidationError('targetUserId is required when targetType is USER');
      }
      if (input.targetUserId === input.reporterId) {
        throw new ValidationError('You cannot report yourself');
      }
      if (input.targetSessionId) {
        throw new ValidationError('targetSessionId must not be set when targetType is USER');
      }
    }

    if (input.targetType === 'SESSION') {
      if (!input.targetSessionId) {
        throw new ValidationError('targetSessionId is required when targetType is SESSION');
      }
      if (input.targetUserId) {
        throw new ValidationError('targetUserId must not be set when targetType is SESSION');
      }
    }

    if (input.targetType === 'GENERAL' && (input.targetUserId || input.targetSessionId)) {
      throw new ValidationError('target IDs must not be provided when targetType is GENERAL');
    }
  }

  private async ensureTargetExists(input: CreateReportInput): Promise<void> {
    if (input.targetType === 'USER') {
      const { data, error } = await this.reportRepository.findUserById(input.targetUserId!);

      if (error) {
        throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to validate reported user: ${error.message}`);
      }
      if (!data) {
        throw new ValidationError('Reported user was not found');
      }
    }

    if (input.targetType === 'SESSION') {
      const { data, error } = await this.reportRepository.findSessionById(input.targetSessionId!);

      if (error) {
        throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to validate reported session: ${error.message}`);
      }
      if (!data) {
        throw new ValidationError('Reported session was not found');
      }
    }
  }

  private async enforceRateLimit(reporterId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: count, error } = await this.reportRepository.countRecentReportsByReporter(reporterId, oneHourAgo);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to apply report rate limit: ${error.message}`);
    }

    if ((count ?? 0) >= this.maxReportsPerHour) {
      throw new RateLimitError('Too many reports submitted. Please try again later.');
    }
  }

  private async enforceDuplicateWindow(input: CreateReportInput): Promise<void> {
    const since = new Date(Date.now() - this.duplicateWindowMinutes * 60 * 1000).toISOString();

    const { data, error } = await this.reportRepository.listRecentReportsForDuplicateCheck(
      input.reporterId,
      input.category,
      since
    );

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to check duplicate reports: ${error.message}`);
    }

    const normalizedDescription = this.normalizeDescription(input.description);
    const recentReports = (data as RecentReportRow[] | null) ?? [];
    const duplicate = recentReports.find((row) => {
      const matchesUser = (row.target_user_id ?? null) === (input.targetType === 'USER' ? input.targetUserId! : null);
      const matchesSession = (row.target_session_id ?? null) === (input.targetType === 'SESSION' ? input.targetSessionId! : null);
      const matchesDescription = this.normalizeDescription(String(row.description ?? '')) === normalizedDescription;
      return matchesUser && matchesSession && matchesDescription;
    });

    if (duplicate) {
      throw new ConflictError('A similar report was already submitted recently. Please wait before submitting again.');
    }
  }

  private normalizeDescription(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private requiresEscalation(category: ReportCategory): boolean {
    if (category === 'CSAM') return true;
    if (category === 'GROOMING_OR_SEXUAL_EXPLOITATION') return this.escalateGrooming;
    return false;
  }

  private async notifySafetyMailbox(reportId: string, category: ReportCategory): Promise<void> {
    if (!this.safetyAlertWebhookUrl) {
      logger.error(
        { type: 'safety_notification_missing_webhook', reportId, category },
        'Safety escalation webhook URL is not configured'
      );
      return;
    }

    try {
      const response = await this.fetchImpl(this.safetyAlertWebhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-safety-token': this.safetyWebhookToken,
        },
        body: JSON.stringify({
          event: 'safety_report_escalated',
          reportId,
          category,
          escalatedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error(
          {
            type: 'safety_notification_failed',
            reportId,
            category,
            status: response.status,
            responseBody: body,
          },
          'Safety escalation webhook failed'
        );
        return;
      }

      logger.info(
        {
          type: 'safety_notification_sent',
          reportId,
          category,
          recipient: this.safetyAlertWebhookUrl,
        },
        'Safety escalation webhook delivered'
      );
    } catch (error) {
      logger.error(
        {
          type: 'safety_notification_failed',
          reportId,
          category,
          error: error instanceof Error ? error.message : String(error),
        },
        'Safety escalation webhook failed'
      );
    }
  }
}
