import type {
  Session,
  CreateSessionInput,
  ListUpcomingParams,
} from "./types";

const mockGames = [
  {
    id: "game-1",
    platformKey: "roblox" as const,
    name: "Blox Fruits",
    url: "https://www.roblox.com/games/2753915549/Blox-Fruits",
    genre: "RPG",
  },
  {
    id: "game-2",
    platformKey: "roblox" as const,
    name: "Tower of Hell",
    url: "https://www.roblox.com/games/1962086868/Tower-of-Hell",
    genre: "Platformer",
  },
];

const mockSessions: Session[] = [
  {
    id: "session-1",
    hostUserId: "user-1",
    game: mockGames[0],
    title: "Grind and Farm Session",
    startTimeUtc: new Date(Date.now() + 3600000).toISOString(),
    durationMinutes: 120,
    maxPlayers: 4,
    sessionType: "casual",
    visibility: "public",
    status: "scheduled",
  },
  {
    id: "session-2",
    hostUserId: "user-2",
    game: mockGames[1],
    title: "Tower Racing",
    startTimeUtc: new Date(Date.now() + 7200000).toISOString(),
    durationMinutes: 60,
    maxPlayers: 8,
    sessionType: "casual",
    visibility: "public",
    status: "scheduled",
  },
];

let sessionCounter = mockSessions.length;

export const mockSessionsStore = {
  async listUpcoming(params: ListUpcomingParams = {}): Promise<Session[]> {
    const { limit = 20, offset = 0 } = params;
    return mockSessions
      .filter((s) => s.status === "scheduled")
      .slice(offset, offset + limit);
  },

  async createSession(input: CreateSessionInput): Promise<Session> {
    sessionCounter++;
    const newSession: Session = {
      id: `session-${sessionCounter}`,
      hostUserId: "user-current",
      game: {
        id: `game-${sessionCounter}`,
        platformKey: "roblox",
        name: input.gameName,
        url: input.gameUrl,
      },
      title: input.title,
      startTimeUtc: input.startTimeUtc,
      durationMinutes: input.durationMinutes,
      maxPlayers: input.maxPlayers,
      sessionType: input.sessionType,
      visibility: "public",
      status: "scheduled",
    };
    mockSessions.push(newSession);
    return newSession;
  },

  async getSessionById(id: string): Promise<Session | null> {
    return mockSessions.find((s) => s.id === id) || null;
  },
};
