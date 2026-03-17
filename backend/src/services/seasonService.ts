import { createSeasonRepository } from '../db/repository-factory.js';
import { isCompetitiveDepthEnabled } from '../config/featureFlags.js';
import { logger } from '../lib/logger.js';
import { sanitize } from '../lib/sanitizer.js';
import { metrics } from '../plugins/metrics.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import type {
  SeasonRepository,
  SeasonRolloverResult,
  SeasonRow,
} from '../db/repositories/season.repository.js';

export class SeasonService {
  private seasonRepositoryInstance: SeasonRepository | null = null;

  private get seasonRepository(): SeasonRepository {
    if (!this.seasonRepositoryInstance) {
      this.seasonRepositoryInstance = createSeasonRepository();
    }
    return this.seasonRepositoryInstance;
  }

  async getActiveSeason(): Promise<SeasonRow | null> {
    if (!isCompetitiveDepthEnabled()) {
      return null;
    }

    const { data, error } = await this.seasonRepository.getActiveSeason();

    if (error && error.code !== 'PGRST116') {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to get active season: ${error.message}`,
        500
      );
    }

    return data || null;
  }

  async snapshotRankings(seasonId: string): Promise<number> {
    if (!isCompetitiveDepthEnabled()) {
      return 0;
    }

    const { data, error } = await this.seasonRepository.snapshotRankings(seasonId);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to snapshot rankings: ${error.message}`,
        500
      );
    }

    return Number(data || 0);
  }

  async resetRatings(): Promise<number> {
    if (!isCompetitiveDepthEnabled()) {
      return 0;
    }

    const { data, error } = await this.seasonRepository.resetRatings();

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to reset ratings: ${error.message}`,
        500
      );
    }

    return Number(data || 0);
  }

  async processRolloverIfNeeded(): Promise<void> {
    if (!isCompetitiveDepthEnabled()) {
      return;
    }

    const { data, error } = await this.seasonRepository.runSeasonRollover(new Date().toISOString());

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to run season rollover: ${error.message}`,
        500
      );
    }

    const result = (data || {}) as SeasonRolloverResult;
    if (!result.rolled_over) {
      return;
    }

    metrics.seasonResetTotal.inc({
      from: String(result.previous_season_number ?? 0),
      to: String(result.new_active_season_number ?? 0),
    });

    logger.info(
      sanitize({
        previousSeasonNumber: result.previous_season_number,
        newActiveSeasonNumber: result.new_active_season_number,
        snapshotRows: result.snapshot_rows,
      }),
      'Competitive season rollover executed'
    );
  }
}
