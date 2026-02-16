import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { metrics } from '../plugins/metrics.js';

export type AchievementCode = 'FIRST_HOST' | 'FIRST_JOIN';
export type StatType = 'sessions_hosted' | 'sessions_joined';

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
  /**
   * Ensure user_stats row exists for the given user
   */
  async ensureUserStatsRow(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('user_stats')
      .upsert(
        {
          user_id: userId,
          sessions_hosted: 0,
          sessions_joined: 0,
          streak_days: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

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

    const supabase = getSupabase();
    const column = statType === 'sessions_hosted' ? 'sessions_hosted' : 'sessions_joined';

    const { error } = await supabase.rpc('increment_user_stat', {
      p_user_id: userId,
      p_column: column,
    });

    if (error) {
      // Fallback: manual increment if RPC doesn't exist
      logger.warn(
        { userId, statType, error: error.message },
        'RPC increment failed, using fallback SELECT + UPDATE'
      );

      const { data: current, error: selectError } = await supabase
        .from('user_stats')
        .select(column)
        .eq('user_id', userId)
        .maybeSingle<{ sessions_hosted?: number; sessions_joined?: number }>();

      if (selectError) {
        throw new AppError(
          ErrorCodes.INTERNAL_DB_ERROR,
          `Failed to read user stat: ${selectError.message}`,
          500
        );
      }

      const currentValue =
        statType === 'sessions_hosted'
          ? (current?.sessions_hosted ?? 0)
          : (current?.sessions_joined ?? 0);

      const { error: updateError } = await supabase
        .from('user_stats')
        .update({
          [column]: currentValue + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        throw new AppError(
          ErrorCodes.INTERNAL_DB_ERROR,
          `Failed to increment user stat: ${updateError.message}`,
          500
        );
      }
    }
  }

  /**
   * Evaluate and unlock achievements for a user
   */
  async evaluateAndUnlock(userId: string): Promise<void> {
    const supabase = getSupabase();

    // Fetch current stats
    const { data: stats, error: statsError } = await supabase
      .from('user_stats')
      .select('sessions_hosted, sessions_joined')
      .eq('user_id', userId)
      .maybeSingle<{ sessions_hosted: number; sessions_joined: number }>();

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
      const { error: insertError } = await supabase
        .from('user_achievements')
        .insert({
          user_id: userId,
          code,
          unlocked_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

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
    const supabase = getSupabase();

    const { data: statsData, error: statsError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle<{
        user_id: string;
        sessions_hosted: number;
        sessions_joined: number;
        streak_days: number;
        last_active_date: string | null;
        created_at: string;
        updated_at: string;
      }>();

    if (statsError && statsError.code !== 'PGRST116') {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch user stats: ${statsError.message}`,
        500
      );
    }

    const { data: achievementsData, error: achievementsError } = await supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

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
