import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export interface AppUser {
  id: string;
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName: string | null;
  robloxProfileUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface UpsertUserInput {
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName?: string;
  robloxProfileUrl?: string;
}

export class UserService {
  async upsertUser(input: UpsertUserInput): Promise<AppUser> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('app_users')
      .upsert(
        {
          roblox_user_id: input.robloxUserId,
          roblox_username: input.robloxUsername,
          roblox_display_name: input.robloxDisplayName || null,
          roblox_profile_url: input.robloxProfileUrl || null,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'roblox_user_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to upsert user: ${error.message}`);
    }

    return {
      id: data.id,
      robloxUserId: data.roblox_user_id,
      robloxUsername: data.roblox_username,
      robloxDisplayName: data.roblox_display_name,
      robloxProfileUrl: data.roblox_profile_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastLoginAt: data.last_login_at,
    };
  }

  async getUserById(id: string): Promise<AppUser | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('app_users')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get user: ${error.message}`);
    }

    return {
      id: data.id,
      robloxUserId: data.roblox_user_id,
      robloxUsername: data.roblox_username,
      robloxDisplayName: data.roblox_display_name,
      robloxProfileUrl: data.roblox_profile_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastLoginAt: data.last_login_at,
    };
  }
}
