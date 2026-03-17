import { createAchievementRepository } from '../db/repository-factory.js';
import { logger } from '../lib/logger.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { metrics } from '../plugins/metrics.js';
import type {
  AchievementCode,
  AchievementRepository,
  StatType,
} from '../db/repositories/achievement.repository.js';

interface UserStats {
  userId: string;
  sessionsHosted: number;
  sessionsJoined: number;
  streakDays: number;
  lastActiveDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Achievement {
  id: string;
  userId: string;
  code: AchievementCode;
  unlockedAt: string;
}

export class AchievementService {
  private achievementRepositoryInstance: AchievementRepository | null = null;

  private get achievementRepository(): AchievementRepository {
    if (!this.achievementRepositoryInstance) {
      this.achievementRepositoryInstance = createAchievementRepository();
    }
    return this.achievementRepositoryInstance;
  }

  /**
   * Ensure user_stats row exists for the given user
   */
  async ensureUserStatsRow(userId: string): Promise<void> {
    const { error } = await this.achievementRepository.ensureUserStatsRow(userId, new Date().toISOString());

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to ensure user_stats row');
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to initialize user stats: ${error.message}`,
        500
      );
    }
  }

  /**
   * Increment a user stat by 1
   */
  async incrementUserStat(userId: string, statType: StatType): Promise<void> {
    await this.ensureUserStatsRow(userId);
    const { error } = await this.achievementRepository.incrementUserStat(userId, statType, new Date().toISOString());

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to increment user stat: ${error.message}`,
        500
      );
    }
  }

  /**
   * Evaluate and unlock achievements for a user
   */
  async evaluateAndUnlock(userId: string): Promise<void> {
    // Fetch current stats
    const { data: stats, error: statsError } = await this.achievementRepository.findUserStatsSummary(userId);

    if (statsError) {
      logger.error({ userId, error: statsError.message }, 'Failed to fetch user stats for achievements');
      return;
    }

    if (!stats) {
      return;
    }

    const achievementsToUnlock: AchievementCode[] = [];

    if (stats.sessions_hosted >= 1) {
      achievementsToUnlock.push('FIRST_HOST');
    }

    if (stats.sessions_joined >= 1) {
      achievementsToUnlock.push('FIRST_JOIN');
    }

    // Attempt to insert achievements (ON CONFLICT DO NOTHING via unique constraint)
    for (const code of achievementsToUnlock) {
      const { error: insertError } = await this.achievementRepository.insertUserAchievement(
        userId,
        code,
        new Date().toISOString()
      );

      if (!insertError) {
        logger.info({ userId, code }, 'Achievement unlocked');
        metrics.achievementsUnlockedTotal.inc({ code });
      } else if (insertError.code === '23505') {
        // Unique constraint violation - achievement already unlocked
        logger.debug({ userId, code }, 'Achievement already unlocked');
      } else {
        logger.error({ userId, code, error: insertError.message }, 'Failed to unlock achievement');
      }
    }
  }

  /**
   * Get user stats and achievements
   */
  async getUserStatsAndAchievements(userId: string): Promise<{
    stats: UserStats | null;
    achievements: Achievement[];
  }> {
    const { data: statsData, error: statsError } = await this.achievementRepository.findUserStats(userId);

    if (statsError && statsError.code !== 'PGRST116') {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch user stats: ${statsError.message}`,
        500
      );
    }

    const { data: achievementsData, error: achievementsError } = await this.achievementRepository.listUserAchievements(userId);

    if (achievementsError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch user achievements: ${achievementsError.message}`,
        500
      );
    }

    const stats = statsData
      ? {
          userId: statsData.user_id,
          sessionsHosted: statsData.sessions_hosted,
          sessionsJoined: statsData.sessions_joined,
          streakDays: statsData.streak_days,
          lastActiveDate: statsData.last_active_date,
          createdAt: statsData.created_at,
          updatedAt: statsData.updated_at,
        }
      : null;

    const achievements = (achievementsData || []).map((a) => ({
      id: a.id,
      userId: a.user_id,
      code: a.code as AchievementCode,
      unlockedAt: a.unlocked_at,
    }));

    return { stats, achievements };
  }
}
