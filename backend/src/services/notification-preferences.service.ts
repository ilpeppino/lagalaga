import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export interface NotificationPreferences {
  userId: string;
  sessionsRemindersEnabled: boolean;
  friendRequestsEnabled: boolean;
}

interface PrefsRow {
  user_id: string;
  sessions_reminders_enabled: boolean;
  friend_requests_enabled: boolean;
}

const DEFAULT_PREFS: Omit<NotificationPreferences, 'userId'> = {
  sessionsRemindersEnabled: true,
  friendRequestsEnabled: true,
};

function mapRow(row: PrefsRow): NotificationPreferences {
  return {
    userId: row.user_id,
    sessionsRemindersEnabled: row.sessions_reminders_enabled,
    friendRequestsEnabled: row.friend_requests_enabled,
  };
}

export class NotificationPreferencesService {
  async getForUser(userId: string): Promise<NotificationPreferences> {
    const supabase = getSupabase();

    const { error: seedError } = await supabase
      .from('user_notification_prefs')
      .upsert(
        {
          user_id: userId,
          sessions_reminders_enabled: true,
          friend_requests_enabled: true,
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

    if (seedError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to seed notification preferences: ${seedError.message}`);
    }

    const { data, error } = await supabase
      .from('user_notification_prefs')
      .select('user_id, sessions_reminders_enabled, friend_requests_enabled')
      .eq('user_id', userId)
      .single<PrefsRow>();

    if (error || !data) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load notification preferences: ${error?.message ?? 'not found'}`);
    }

    return mapRow(data);
  }

  async updateForUser(
    userId: string,
    patch: Partial<Pick<NotificationPreferences, 'sessionsRemindersEnabled' | 'friendRequestsEnabled'>>
  ): Promise<NotificationPreferences> {
    const supabase = getSupabase();

    const payload: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (typeof patch.sessionsRemindersEnabled === 'boolean') {
      payload.sessions_reminders_enabled = patch.sessionsRemindersEnabled;
    }

    if (typeof patch.friendRequestsEnabled === 'boolean') {
      payload.friend_requests_enabled = patch.friendRequestsEnabled;
    }

    const { data, error } = await supabase
      .from('user_notification_prefs')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, sessions_reminders_enabled, friend_requests_enabled')
      .single<PrefsRow>();

    if (error || !data) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to update notification preferences: ${error?.message ?? 'unknown'}`);
    }

    return mapRow(data);
  }

  async getByUserIds(userIds: string[]): Promise<Map<string, NotificationPreferences>> {
    const map = new Map<string, NotificationPreferences>();

    for (const userId of userIds) {
      map.set(userId, {
        userId,
        ...DEFAULT_PREFS,
      });
    }

    if (userIds.length === 0) {
      return map;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_notification_prefs')
      .select('user_id, sessions_reminders_enabled, friend_requests_enabled')
      .in('user_id', userIds);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load notification preferences: ${error.message}`);
    }

    for (const row of (data ?? []) as PrefsRow[]) {
      map.set(row.user_id, mapRow(row));
    }

    return map;
  }
}
