/**
 * Epic 3 Session Types - Matches new database schema
 */

export type SessionVisibility = 'public' | 'friends' | 'invite_only';
export type SessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type ParticipantRole = 'host' | 'member';
export type ParticipantState = 'invited' | 'joined' | 'left' | 'kicked';
export type ParticipantHandoffState = 'rsvp_joined' | 'opened_roblox' | 'confirmed_in_game' | 'stuck';

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
  isRanked: boolean;
  status: SessionStatus;
  maxParticipants: number;
  currentParticipants: number;
  scheduledStart?: string;
  game: Game;
  createdAt: string;
}

export interface SessionDetail extends Session {
  host?: {
    userId: string;
    robloxUsername: string | null;
    robloxDisplayName: string | null;
    avatarHeadshotUrl: string | null;
  };
  participants: SessionParticipant[];
  inviteLink?: string;
}

export interface SessionParticipant {
  userId: string;
  role: ParticipantRole;
  state: ParticipantState;
  handoffState?: ParticipantHandoffState;
  joinedAt: string;
}

export interface CreateSessionInput {
  robloxUrl: string;
  title: string;
  visibility?: SessionVisibility;
  is_ranked?: boolean;
  maxParticipants?: number;
  scheduledStart?: string; // ISO 8601 timestamp
  invitedRobloxUserIds?: number[];
}

export interface MatchResultResponse {
  sessionId: string;
  winnerId: string;
  ratingDelta: number;
  updates: {
    userId: string;
    rating: number;
    wins: number;
    losses: number;
    delta: number;
  }[];
}

export type SkillTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  displayName: string | null;
  tier?: SkillTier;
}

export interface LeaderboardResponse {
  type: 'weekly';
  timezone: 'Europe/Amsterdam';
  generatedAt: string;
  entries: LeaderboardEntry[];
}

export interface MatchHistoryEntry {
  sessionId: string;
  sessionTitle: string;
  playedAt: string;
  result: 'win' | 'loss';
  winnerId: string;
  ratingDelta: number;
  opponents: {
    userId: string;
    displayName: string | null;
  }[];
}

export interface MatchHistoryResponse {
  timezone: 'Europe/Amsterdam';
  entries: MatchHistoryEntry[];
}

export interface RobloxFriend {
  id: number;
  name: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RobloxFriendsResponse {
  robloxUserId: string;
  source: 'cache' | 'refreshed';
  fetchedAt: string;
  expiresAt: string;
  friends: RobloxFriend[];
}

export interface RobloxFavoriteGame {
  universeId: number;
  placeId: number | null;
  name: string | null;
  thumbnailUrl: string | null;
  canonicalWebUrl: string | null;
  canonicalStartUrl: string | null;
}

export interface RobloxFavoritesResponse {
  robloxUserId: string;
  favorites: RobloxFavoriteGame[];
  pagination: {
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
    previousCursor: string | null;
  };
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
