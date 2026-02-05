import { apiClient } from '../../lib/api';
import type { SessionsStore } from './index';
import type { Session, CreateSessionInput, ListUpcomingParams } from './types';

export const apiSessionsStore: SessionsStore = {
  async listUpcoming(params?: ListUpcomingParams): Promise<Session[]> {
    const response = await apiClient.sessions.list(params);
    return response.sessions;
  },

  async createSession(input: CreateSessionInput): Promise<Session> {
    const { session } = await apiClient.sessions.create(input);
    return session;
  },

  async getSessionById(id: string): Promise<Session | null> {
    try {
      const { session } = await apiClient.sessions.getById(id);
      return session;
    } catch (error) {
      // Return null if not found
      console.error('Failed to get session:', error);
      return null;
    }
  },
};
