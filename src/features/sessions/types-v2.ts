/**
 * Epic 3 Session Types - Matches new database schema
 */

export type SessionVisibility = 'public' | 'friends' | 'invite_only';
export type SessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type ParticipantRole = 'host' | 'member';
export type ParticipantState = 'invited' | 'joined' | 'left' | 'kicked';

export interface Game {
  placeId: number;
  canonicalWebUrl: string;
  canonicalStartUrl: string;
  gameName?: string;
  thumbnailUrl?: string;
}

export interface Session {
  id: string;
  placeId: number;
  hostId: string;
  title: string;
  description?: string;
  visibility: SessionVisibility;
  status: SessionStatus;
  maxParticipants: number;
  currentParticipants: number;
  scheduledStart?: string;
  game: Game;
  createdAt: string;
}

export interface SessionDetail extends Session {
  participants: SessionParticipant[];
  inviteLink?: string;
}

export interface SessionParticipant {
  userId: string;
  role: ParticipantRole;
  state: ParticipantState;
  joinedAt: string;
}

export interface CreateSessionInput {
  robloxUrl: string;
  title: string;
  visibility?: SessionVisibility;
  maxParticipants?: number;
  scheduledStart?: string; // ISO 8601 timestamp
}

export interface SessionWithInvite {
  session: Session;
  inviteLink: string;
}

export interface ListSessionsParams {
  status?: SessionStatus;
  visibility?: SessionVisibility;
  placeId?: number;
  hostId?: string;
  limit?: number;
  offset?: number;
}

export interface ListSessionsResponse {
  sessions: Session[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
