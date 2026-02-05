export type PlatformKey = "roblox";

export interface Game {
  id: string;
  platformKey: PlatformKey;
  name: string;
  url: string;
  genre?: string;
}

export type SessionType = "casual" | "ranked" | "tournament" | "practice";
export type SessionVisibility = "public" | "friends" | "private";
export type SessionStatus = "scheduled" | "active" | "completed" | "cancelled";

export interface Session {
  id: string;
  hostUserId: string;
  game: Game;
  title?: string;
  startTimeUtc: string;
  durationMinutes?: number;
  maxPlayers: number;
  sessionType: SessionType;
  visibility: SessionVisibility;
  status: SessionStatus;
}

export interface SessionParticipant {
  userId: string;
  sessionId: string;
  role: "host" | "player";
  state: "invited" | "joined" | "left";
}

export interface CreateSessionInput {
  gameName: string;
  gameUrl: string;
  title?: string;
  startTimeUtc: string;
  durationMinutes?: number;
  maxPlayers: number;
  sessionType: SessionType;
}

export interface ListUpcomingParams {
  limit?: number;
  offset?: number;
}
