import { isSupabaseConfigured } from "../../lib/supabase";
import { mockSessionsStore } from "./mock";
import { supabaseSessionsStore } from "./store";
import type { SessionsStore } from "./store";

export function getSessionsStore(): SessionsStore {
  if (isSupabaseConfigured()) {
    return supabaseSessionsStore;
  }
  return mockSessionsStore;
}

export * from "./types";
