import { createMatchHistoryRepository } from '../db/repository-factory.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import type {
  MatchHistoryRepository,
  MatchHistoryRepositoryRow,
} from '../db/repositories/match-history.repository.js';

export interface MatchHistoryItem {
  sessionId: string;
  sessionTitle: string;
  playedAt: string;
  result: 'win' | 'loss';
  winnerId: string;
  ratingDelta: number;
  opponents: Array<{
    userId: string;
    displayName: string | null;
  }>;
}

export class MatchHistoryService {
  private matchHistoryRepositoryInstance: MatchHistoryRepository | null = null;

  private get matchHistoryRepository(): MatchHistoryRepository {
    if (!this.matchHistoryRepositoryInstance) {
      this.matchHistoryRepositoryInstance = createMatchHistoryRepository();
    }
    return this.matchHistoryRepositoryInstance;
  }

  async getMyMatchHistory(userId: string, limit = 20): Promise<{
    timezone: 'Europe/Amsterdam';
    entries: MatchHistoryItem[];
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const { data, error } = await this.matchHistoryRepository.listHistoryRowsForUser(userId, safeLimit);
    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch match history: ${error.message}`,
        500
      );
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        timezone: 'Europe/Amsterdam',
        entries: [],
      };
    }

    const bySession = new Map<string, MatchHistoryRepositoryRow[]>();
    for (const row of rows) {
      if (!bySession.has(row.session_id)) {
        bySession.set(row.session_id, []);
      }
      bySession.get(row.session_id)!.push(row);
    }

    const entries: MatchHistoryItem[] = [];
    const emitted = new Set<string>();
    for (const row of rows) {
      if (emitted.has(row.session_id)) continue;
      emitted.add(row.session_id);

      const grouped = bySession.get(row.session_id) || [];
      const opponents = grouped
        .filter((item) => item.participant_user_id && item.participant_user_id !== userId)
        .map((item) => ({
          userId: item.participant_user_id as string,
          displayName: item.participant_display_name || null,
        }));

      const isWin = row.winner_id === userId;
      entries.push({
        sessionId: row.session_id,
        sessionTitle: row.session_title || 'Ranked session',
        playedAt: row.created_at,
        result: isWin ? 'win' : 'loss',
        winnerId: row.winner_id,
        ratingDelta: isWin ? row.rating_delta : -Math.abs(row.rating_delta),
        opponents,
      });
    }

    return {
      timezone: 'Europe/Amsterdam',
      entries,
    };
  }
}
