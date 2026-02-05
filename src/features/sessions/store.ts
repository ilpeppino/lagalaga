import type {
  Session,
  CreateSessionInput,
  ListUpcomingParams,
} from "./types";

/**
 * SessionsStore interface
 * Defines the contract for session data operations
 */
export interface SessionsStore {
  listUpcoming(params?: ListUpcomingParams): Promise<Session[]>;
  createSession(input: CreateSessionInput): Promise<Session>;
  getSessionById(id: string): Promise<Session | null>;
}
