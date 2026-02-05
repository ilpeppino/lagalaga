import { mockSessionsStore } from "./mock";
import { apiSessionsStore } from "./apiStore";
import type { SessionsStore } from "./store";

export function getSessionsStore(): SessionsStore {
  // Use API store if API URL is configured
  if (process.env.EXPO_PUBLIC_API_URL) {
    return apiSessionsStore;
  }
  // Fallback to mock store
  return mockSessionsStore;
}

export * from "./types";
export type { SessionsStore } from "./store";
