import type {
  Session,
  CreateSessionInput,
  ListUpcomingParams,
} from "./types";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { mockSessionsStore } from "./mock";

export interface SessionsStore {
  listUpcoming(params?: ListUpcomingParams): Promise<Session[]>;
  createSession(input: CreateSessionInput): Promise<Session>;
  getSessionById(id: string): Promise<Session | null>;
}

export const supabaseSessionsStore: SessionsStore = {
  async listUpcoming(params: ListUpcomingParams = {}): Promise<Session[]> {
    if (!isSupabaseConfigured()) {
      console.warn(
        "Supabase not configured, falling back to mock data in supabaseSessionsStore"
      );
      return mockSessionsStore.listUpcoming(params);
    }

    try {
      const { limit = 20, offset = 0 } = params;
      const { data, error } = await supabase
        .from("sessions")
        .select(
          `
          *,
          game:games(*)
        `
        )
        .eq("status", "scheduled")
        .order("start_time_utc", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        console.warn("Supabase query error, falling back to mock:", error);
        return mockSessionsStore.listUpcoming(params);
      }

      // TODO: Map Supabase row format to Session type
      return data || [];
    } catch (err) {
      console.warn("Supabase error, falling back to mock:", err);
      return mockSessionsStore.listUpcoming(params);
    }
  },

  async createSession(input: CreateSessionInput): Promise<Session> {
    if (!isSupabaseConfigured()) {
      console.warn(
        "Supabase not configured, falling back to mock data in supabaseSessionsStore"
      );
      return mockSessionsStore.createSession(input);
    }

    try {
      // TODO: Create game entry first, then session
      // For now, fallback to mock
      console.warn("Supabase createSession not implemented, using mock");
      return mockSessionsStore.createSession(input);
    } catch (err) {
      console.warn("Supabase error, falling back to mock:", err);
      return mockSessionsStore.createSession(input);
    }
  },

  async getSessionById(id: string): Promise<Session | null> {
    if (!isSupabaseConfigured()) {
      console.warn(
        "Supabase not configured, falling back to mock data in supabaseSessionsStore"
      );
      return mockSessionsStore.getSessionById(id);
    }

    try {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          `
          *,
          game:games(*)
        `
        )
        .eq("id", id)
        .single();

      if (error) {
        console.warn("Supabase query error, falling back to mock:", error);
        return mockSessionsStore.getSessionById(id);
      }

      // TODO: Map Supabase row format to Session type
      return data || null;
    } catch (err) {
      console.warn("Supabase error, falling back to mock:", err);
      return mockSessionsStore.getSessionById(id);
    }
  },
};
