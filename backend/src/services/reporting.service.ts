import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import {
  AppError,
  ConflictError,
  ErrorCodes,
  RateLimitError,
  ValidationError,
} from '../utils/errors.js';

export const REPORT_CATEGORIES = [
  'CSAM',
  'GROOMING_OR_SEXUAL_EXPLOITATION',
  'HARASSMENT_OR_ABUSIVE_BEHAVIOR',
  'IMPERSONATION',
  'OTHER',
] as const;

export const REPORT_TARGET_TYPES = ['USER', 'SESSION', 'GENERAL'] as const;

type ReportCategory = (typeof REPORT_CATEGORIES)[number];
type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
type ReportStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'ESCALATED';

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

interface ReportInsertRow {
  id: string;
  status: ReportStatus;
  created_at: string;
}

interface RecentReportRow {
  id: string;
  target_user_id: string | null;
  target_session_id: string | null;
  description: string | null;
}

interface ServiceOptions {
  maxReportsPerHour?: number;
  duplicateWindowMinutes?: number;
}

export class ReportingService {
  private readonly maxReportsPerHour: number;
  private readonly duplicateWindowMinutes: number;

  constructor(options: ServiceOptions = {}) {
    this.maxReportsPerHour = options.maxReportsPerHour ?? 5;
    this.duplicateWindowMinutes = options.duplicateWindowMinutes ?? 5;
  }

  async createReport(input: CreateReportInput): Promise<{ ticketId: string; status: ReportStatus; createdAt: string }> {
    this.validateInput(input);
    await this.ensureTargetExists(input);
    await this.enforceRateLimit(input.reporterId);
    await this.enforceDuplicateWindow(input);

    const status: ReportStatus = input.category === 'CSAM' ? 'ESCALATED' : 'OPEN';
    const description = input.description.trim();
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: input.reporterId,
        target_user_id: input.targetType === 'USER' ? input.targetUserId! : null,
        target_session_id: input.targetType === 'SESSION' ? input.targetSessionId! : null,
        category: input.category,
        description,
        status,
      })
      .select('id, status, created_at')
      .single<ReportInsertRow>();

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
    if (!REPORT_CATEGORIES.includes(input.category)) {
      throw new ValidationError('Invalid report category');
    }

    if (!REPORT_TARGET_TYPES.includes(input.targetType)) {
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
    const supabase = getSupabase();

    if (input.targetType === 'USER') {
      const { data, error } = await supabase
        .from('app_users')
        .select('id')
        .eq('id', input.targetUserId!)
        .maybeSingle<{ id: string }>();

      if (error) {
        throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to validate reported user: ${error.message}`);
      }
      if (!data) {
        throw new ValidationError('Reported user was not found');
      }
    }

    if (input.targetType === 'SESSION') {
      const { data, error } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', input.targetSessionId!)
        .maybeSingle<{ id: string }>();

      if (error) {
        throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to validate reported session: ${error.message}`);
      }
      if (!data) {
        throw new ValidationError('Reported session was not found');
      }
    }
  }

  private async enforceRateLimit(reporterId: string): Promise<void> {
    const supabase = getSupabase();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', reporterId)
      .gte('created_at', oneHourAgo);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to apply report rate limit: ${error.message}`);
    }

    if ((count ?? 0) >= this.maxReportsPerHour) {
      throw new RateLimitError('Too many reports submitted. Please try again later.');
    }
  }

  private async enforceDuplicateWindow(input: CreateReportInput): Promise<void> {
    const supabase = getSupabase();
    const since = new Date(Date.now() - this.duplicateWindowMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('reports')
      .select('id, target_user_id, target_session_id, description')
      .eq('reporter_id', input.reporterId)
      .eq('category', input.category)
      .gte('created_at', since);

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

  private async notifySafetyMailbox(reportId: string, category: ReportCategory): Promise<void> {
    logger.info(
      {
        type: 'safety_notification_stub',
        reportId,
        category,
        recipient: 'lagalaga@gtemp1.com',
      },
      'Safety escalation email stub queued'
    );
  }
}
