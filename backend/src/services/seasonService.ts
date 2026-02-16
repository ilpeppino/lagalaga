import { getSupabase } from '../config/supabase.js';
import { isCompetitiveDepthEnabled } from '../config/featureFlags.js';
import { logger } from '../lib/logger.js';
import { sanitize } from '../lib/sanitizer.js';
import { metrics } from '../plugins/metrics.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

interface SeasonRow {
  id: string;
  season_number: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

interface RolloverResult {
  rolled_over: boolean;
  previous_season_number: number | null;
  new_active_season_number: number | null;
  snapshot_rows: number;
}

export class SeasonService {
  async getActiveSeason(): Promise<SeasonRow | null> {
    if (!isCompetitiveDepthEnabled()) {
      return null;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('seasons')
      .select('id, season_number, start_date, end_date, is_active, created_at')
      .eq('is_active', true)
      .maybeSingle<SeasonRow>();

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

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('snapshot_rankings_for_season', {
      p_season_id: seasonId,
    });

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

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('reset_all_rankings_for_new_season');

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

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('run_competitive_season_rollover', {
      p_now: new Date().toISOString(),
    });

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to run season rollover: ${error.message}`,
        500
      );
    }

    const result = (data || {}) as RolloverResult;
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
