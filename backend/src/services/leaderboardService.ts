import { createLeaderboardRepository } from '../db/repository-factory.js';
import type { LeaderboardRow } from '../db/repositories/leaderboard.repository.js';
import { RankingService, type SkillTier } from './rankingService.js';
import { AppError, ErrorCodes, ValidationError } from '../utils/errors.js';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  displayName: string | null;
  tier?: SkillTier;
}

export interface LeaderboardResponse {
  type: 'weekly';
  timezone: 'Europe/Amsterdam';
  generatedAt: string;
  entries: LeaderboardEntry[];
}

export class LeaderboardService {
  async getLeaderboard(type: string = 'weekly', includeTier = false): Promise<LeaderboardResponse> {
    if (type !== 'weekly') {
      throw new ValidationError(`Unsupported leaderboard type: ${type}`);
    }

    const repository = createLeaderboardRepository();
    const { data, error } = await repository.getWeekly(10);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch leaderboard: ${error.message}`,
        500
      );
    }

    const entries = ((data || []) as LeaderboardRow[])
      .map((row) => ({
        rank: Number(row.rank),
        userId: row.user_id,
        rating: row.rating,
        wins: row.wins,
        losses: row.losses,
        displayName: row.display_name,
        ...(includeTier ? { tier: RankingService.getTierFromRating(row.rating) } : {}),
      }))
      .sort((a, b) => (b.rating - a.rating) || a.userId.localeCompare(b.userId))
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    return {
      type: 'weekly',
      timezone: 'Europe/Amsterdam',
      generatedAt: new Date().toISOString(),
      entries,
    };
  }
}
