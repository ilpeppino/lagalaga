import { createRankingRepository } from '../db/repository-factory.js';
import { isCompetitiveDepthEnabled } from '../config/featureFlags.js';
import { sanitize } from '../lib/sanitizer.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../plugins/metrics.js';
import { AppError, ConflictError, ErrorCodes, SessionError, ValidationError, RateLimitError } from '../utils/errors.js';
import type { RankedSessionRow, RatingUpdateRow } from '../db/repositories/ranking.repository.js';

const FIXED_RATING_DELTA = 25;
const RESULT_SUBMIT_RATE_LIMIT_MS = 10_000;
const MIN_RANKED_SESSION_DURATION_MS = 120_000;
const MAX_RANKED_MATCHES_PER_OPPONENT_PER_24H = 3;
const OPPONENT_WINDOW_HOURS = 24;

const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'] as const;
export type SkillTier = (typeof TIER_ORDER)[number];

export interface MatchResultSubmission {
  sessionId: string;
  winnerId: string;
  ratingDelta: number;
  updates: Array<{
    userId: string;
    rating: number;
    wins: number;
    losses: number;
    delta: number;
  }>;
}

export class RankingService {
  private static recentSubmissionByKey = new Map<string, number>();
  private rankingRepositoryInstance: ReturnType<typeof createRankingRepository> | null = null;

  private get rankingRepository() {
    if (!this.rankingRepositoryInstance) {
      this.rankingRepositoryInstance = createRankingRepository();
    }
    return this.rankingRepositoryInstance;
  }

  static getTierFromRating(rating: number): SkillTier {
    if (rating >= 1800) return 'master';
    if (rating >= 1600) return 'diamond';
    if (rating >= 1400) return 'platinum';
    if (rating >= 1200) return 'gold';
    if (rating >= 1000) return 'silver';
    return 'bronze';
  }

  private static tierRank(tier: SkillTier): number {
    return TIER_ORDER.indexOf(tier);
  }

  enforceSubmissionRateLimit(userId: string, sessionId: string): void {
    const now = Date.now();
    const key = `${userId}:${sessionId}`;
    const previous = RankingService.recentSubmissionByKey.get(key);

    if (previous && now - previous < RESULT_SUBMIT_RATE_LIMIT_MS) {
      throw new RateLimitError('Please wait before submitting another result for this session');
    }

    RankingService.recentSubmissionByKey.set(key, now);

    // Opportunistic cleanup to keep memory bounded.
    if (RankingService.recentSubmissionByKey.size > 2000) {
      for (const [entryKey, timestamp] of RankingService.recentSubmissionByKey.entries()) {
        if (now - timestamp > RESULT_SUBMIT_RATE_LIMIT_MS) {
          RankingService.recentSubmissionByKey.delete(entryKey);
        }
      }
    }
  }

  async ensureRankingRow(userId: string): Promise<void> {
    const { error } = await this.rankingRepository.ensureRankingRow(userId, new Date().toISOString());

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to ensure user ranking row: ${error.message}`,
        500
      );
    }
  }

  private async getJoinedParticipants(sessionId: string): Promise<string[]> {
    const { data, error } = await this.rankingRepository.listJoinedParticipantIds(sessionId);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to load participants for anti-abuse checks: ${error.message}`,
        500
      );
    }

    return data ?? [];
  }

  private async enforceMinimumSessionDuration(session: RankedSessionRow): Promise<void> {
    if (!session.created_at) {
      return;
    }

    const createdAt = new Date(session.created_at).getTime();
    if (Number.isNaN(createdAt)) {
      return;
    }

    const elapsedMs = Date.now() - createdAt;
    if (elapsedMs < MIN_RANKED_SESSION_DURATION_MS) {
      if (isCompetitiveDepthEnabled()) {
        metrics.suspiciousRankedActivityTotal.inc({ reason: 'short_duration' });
      }
      throw new ValidationError('Ranked match result cannot be submitted this early');
    }
  }

  private async enforceOpponentWindowLimit(participantIds: string[]): Promise<void> {
    if (participantIds.length < 2) {
      return;
    }

    const windowStartIso = new Date(Date.now() - OPPONENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < participantIds.length; i += 1) {
      for (let j = i + 1; j < participantIds.length; j += 1) {
        const userA = participantIds[i];
        const userB = participantIds[j];

        const { data, error } = await this.rankingRepository.countRecentRankedMatchesBetweenUsers(
          userA,
          userB,
          windowStartIso
        );

        if (error) {
          throw new AppError(
            ErrorCodes.INTERNAL_DB_ERROR,
            `Failed anti-abuse opponent check: ${error.message}`,
            500
          );
        }

        const recentCount = Number(data ?? 0);
        if (recentCount >= MAX_RANKED_MATCHES_PER_OPPONENT_PER_24H) {
          if (isCompetitiveDepthEnabled()) {
            metrics.suspiciousRankedActivityTotal.inc({ reason: 'opponent_limit' });
          }
          throw new ValidationError('Too many recent ranked matches against the same opponent');
        }
      }
    }
  }

  private async enforceRankedIntegrity(sessionId: string, winnerId: string): Promise<void> {
    const { data: session, error: sessionError } = await this.rankingRepository.findRankedSessionById(sessionId);

    if (sessionError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to load ranked session for anti-abuse checks: ${sessionError.message}`,
        500
      );
    }

    if (!session) {
      throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    if (!session.is_ranked) {
      throw new ValidationError('Match result submission is only available for ranked sessions');
    }

    await this.enforceMinimumSessionDuration(session);

    const participantIds = await this.getJoinedParticipants(sessionId);
    if (!participantIds.includes(winnerId)) {
      throw new ValidationError('winnerId must belong to a joined participant in this session');
    }

    await this.enforceOpponentWindowLimit(participantIds);
  }

  async submitMatchResult(
    sessionId: string,
    winnerId: string,
    submittedByUserId: string
  ): Promise<MatchResultSubmission> {
    await this.enforceRankedIntegrity(sessionId, winnerId);
    await this.ensureRankingRow(winnerId);

    const { data, error } = await this.rankingRepository.submitRankedMatchResult({
      sessionId,
      winnerId,
      submittedByUserId,
      ratingDelta: FIXED_RATING_DELTA,
      occurredAtIso: new Date().toISOString(),
    });

    if (error) {
      const message = error.message || 'Failed to submit ranked match result';

      if (message.includes('MATCH_RESULT_EXISTS') || error.code === '23505') {
        throw new ConflictError('Result already submitted for this session');
      }
      if (message.includes('RANKING_FORBIDDEN')) {
        throw new SessionError(ErrorCodes.FORBIDDEN, 'Only the host can submit ranked results', 403);
      }
      if (message.includes('RANKED_REQUIRED')) {
        throw new ValidationError('Match result submission is only available for ranked sessions');
      }
      if (message.includes('INVALID_WINNER')) {
        throw new ValidationError('winnerId must belong to a joined participant in this session');
      }
      if (message.includes('INSUFFICIENT_PARTICIPANTS')) {
        throw new ValidationError('Ranked result submission requires at least 2 joined participants');
      }
      if (message.includes('INVALID_STATUS')) {
        throw new SessionError(
          ErrorCodes.SESSION_NOT_ACTIVE,
          'Session must be active or completed to submit ranked results',
          400
        );
      }
      if (message.includes('SESSION_NOT_FOUND')) {
        throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
      }

      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to submit ranked match result: ${message}`,
        500
      );
    }

    const updates = (data ?? []).map((row: RatingUpdateRow) => ({
      userId: row.user_id,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
      delta: row.delta,
    }));

    metrics.rankedMatchResultsTotal.inc();
    metrics.ratingUpdatesTotal.inc({ count: String(updates.length) });

    const winnerUpdate = updates.find((entry) => entry.userId === winnerId);
    if (winnerUpdate && isCompetitiveDepthEnabled()) {
      const previousWinnerTier = RankingService.getTierFromRating(winnerUpdate.rating - FIXED_RATING_DELTA);
      const currentWinnerTier = RankingService.getTierFromRating(winnerUpdate.rating);
      if (RankingService.tierRank(currentWinnerTier) > RankingService.tierRank(previousWinnerTier)) {
        metrics.tierPromotionsTotal.inc({
          from: previousWinnerTier,
          to: currentWinnerTier,
        });
      }
    }

    logger.info(
      sanitize({
        sessionId,
        winnerId,
        submittedByUserId,
        ratingDelta: FIXED_RATING_DELTA,
        participantCount: updates.length,
      }),
      'Match result submitted'
    );

    logger.info(
      sanitize({ winnerId, delta: FIXED_RATING_DELTA }),
      'Rating updated'
    );

    return {
      sessionId,
      winnerId,
      ratingDelta: FIXED_RATING_DELTA,
      updates,
    };
  }
}
