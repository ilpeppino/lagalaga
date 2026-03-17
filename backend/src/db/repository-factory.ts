import { getProvider } from './provider.js';
import { getPool } from './pool.js';
import {
  AccountDeletionRepository,
  PgAccountDeletionRepository,
  SupabaseAccountDeletionRepository,
} from './repositories/account-deletion.repository.js';
import {
  AchievementRepository,
  PgAchievementRepository,
  SupabaseAchievementRepository,
} from './repositories/achievement.repository.js';
import {
  AuditRepository,
  PgAuditRepository,
  SupabaseAuditRepository,
} from './repositories/audit.repository.js';
import {
  HealthRepository,
  PgHealthRepository,
  SupabaseHealthRepository,
} from './repositories/health.repository.js';
import {
  LeaderboardRepository,
  PgLeaderboardRepository,
  SupabaseLeaderboardRepository,
} from './repositories/leaderboard.repository.js';
import {
  CacheCleanupRepository,
  PgCacheCleanupRepository,
  SupabaseCacheCleanupRepository,
} from './repositories/cache-cleanup.repository.js';
import {
  PgPushTokenRepository,
  PushTokenRepository,
  SupabasePushTokenRepository,
} from './repositories/push-token.repository.js';
import {
  MatchHistoryRepository,
  PgMatchHistoryRepository,
  SupabaseMatchHistoryRepository,
} from './repositories/match-history.repository.js';
import {
  PgUserRepository,
  SupabaseUserRepository,
  UserRepository,
} from './repositories/user.repository.js';
import {
  PgUserPlatformRepository,
  SupabaseUserPlatformRepository,
  UserPlatformRepository,
} from './repositories/user-platform.repository.js';
import {
  PgSessionRepository,
  SessionRepository,
  SupabaseSessionRepository,
} from './repositories/session.repository.js';
import {
  PgSessionLifecycleRepository,
  SessionLifecycleRepository,
  SupabaseSessionLifecycleRepository,
} from './repositories/session-lifecycle.repository.js';
import {
  PgSeasonRepository,
  SeasonRepository,
  SupabaseSeasonRepository,
} from './repositories/season.repository.js';
import {
  PgRankingRepository,
  RankingRepository,
  SupabaseRankingRepository,
} from './repositories/ranking.repository.js';
import {
  PgReportRepository,
  ReportRepository,
  SupabaseReportRepository,
} from './repositories/report.repository.js';
import {
  FriendshipRepository,
  PgFriendshipRepository,
  SupabaseFriendshipRepository,
} from './repositories/friendship.repository.js';
import {
  FavoriteExperiencesRepository,
  PgFavoriteExperiencesRepository,
  SupabaseFavoriteExperiencesRepository,
} from './repositories/favorite-experiences.repository.js';
import {
  PgRobloxExperienceResolverRepository,
  RobloxExperienceResolverRepository,
  SupabaseRobloxExperienceResolverRepository,
} from './repositories/roblox-experience-resolver.repository.js';
import {
  PgRobloxFriendsCacheRepository,
  RobloxFriendsCacheRepository,
  SupabaseRobloxFriendsCacheRepository,
} from './repositories/roblox-friends-cache.repository.js';

export interface RepositoryCreators<TRepository> {
  supabase: () => TRepository;
  postgres: () => TRepository;
}

export function createRepository<TRepository>(
  creators: RepositoryCreators<TRepository>
): TRepository {
  return getProvider() === 'postgres' ? creators.postgres() : creators.supabase();
}

export function createHealthRepository(): HealthRepository {
  return createRepository<HealthRepository>({
    supabase: () => new SupabaseHealthRepository(),
    postgres: () => new PgHealthRepository(getPool()),
  });
}

export function createAccountDeletionRepository(): AccountDeletionRepository {
  return createRepository<AccountDeletionRepository>({
    supabase: () => new SupabaseAccountDeletionRepository(),
    postgres: () => new PgAccountDeletionRepository(getPool()),
  });
}

export function createAchievementRepository(): AchievementRepository {
  return createRepository<AchievementRepository>({
    supabase: () => new SupabaseAchievementRepository(),
    postgres: () => new PgAchievementRepository(getPool()),
  });
}

export function createAuditRepository(): AuditRepository {
  return createRepository<AuditRepository>({
    supabase: () => new SupabaseAuditRepository(),
    postgres: () => new PgAuditRepository(getPool()),
  });
}

export function createLeaderboardRepository(): LeaderboardRepository {
  return createRepository<LeaderboardRepository>({
    supabase: () => new SupabaseLeaderboardRepository(),
    postgres: () => new PgLeaderboardRepository(getPool()),
  });
}

export function createCacheCleanupRepository(): CacheCleanupRepository {
  return createRepository<CacheCleanupRepository>({
    supabase: () => new SupabaseCacheCleanupRepository(),
    postgres: () => new PgCacheCleanupRepository(getPool()),
  });
}

export function createPushTokenRepository(): PushTokenRepository {
  return createRepository<PushTokenRepository>({
    supabase: () => new SupabasePushTokenRepository(),
    postgres: () => new PgPushTokenRepository(getPool()),
  });
}

export function createMatchHistoryRepository(): MatchHistoryRepository {
  return createRepository<MatchHistoryRepository>({
    supabase: () => new SupabaseMatchHistoryRepository(),
    postgres: () => new PgMatchHistoryRepository(getPool()),
  });
}

export function createUserRepository(): UserRepository {
  return createRepository<UserRepository>({
    supabase: () => new SupabaseUserRepository(),
    postgres: () => new PgUserRepository(getPool()),
  });
}

export function createUserPlatformRepository(): UserPlatformRepository {
  return createRepository<UserPlatformRepository>({
    supabase: () => new SupabaseUserPlatformRepository(),
    postgres: () => new PgUserPlatformRepository(getPool()),
  });
}

export function createSessionRepository(): SessionRepository {
  return createRepository<SessionRepository>({
    supabase: () => new SupabaseSessionRepository(),
    postgres: () => new PgSessionRepository(getPool()),
  });
}

export function createSessionLifecycleRepository(): SessionLifecycleRepository {
  return createRepository<SessionLifecycleRepository>({
    supabase: () => new SupabaseSessionLifecycleRepository(),
    postgres: () => new PgSessionLifecycleRepository(getPool()),
  });
}

export function createSeasonRepository(): SeasonRepository {
  return createRepository<SeasonRepository>({
    supabase: () => new SupabaseSeasonRepository(),
    postgres: () => new PgSeasonRepository(getPool()),
  });
}

export function createRankingRepository(): RankingRepository {
  return createRepository<RankingRepository>({
    supabase: () => new SupabaseRankingRepository(),
    postgres: () => new PgRankingRepository(getPool()),
  });
}

export function createReportRepository(): ReportRepository {
  return createRepository<ReportRepository>({
    supabase: () => new SupabaseReportRepository(),
    postgres: () => new PgReportRepository(getPool()),
  });
}

export function createFriendshipRepository(): FriendshipRepository {
  return createRepository<FriendshipRepository>({
    supabase: () => new SupabaseFriendshipRepository(),
    postgres: () => new PgFriendshipRepository(getPool()),
  });
}

export function createFavoriteExperiencesRepository(): FavoriteExperiencesRepository {
  return createRepository<FavoriteExperiencesRepository>({
    supabase: () => new SupabaseFavoriteExperiencesRepository(),
    postgres: () => new PgFavoriteExperiencesRepository(getPool()),
  });
}

export function createRobloxExperienceResolverRepository(): RobloxExperienceResolverRepository {
  return createRepository<RobloxExperienceResolverRepository>({
    supabase: () => new SupabaseRobloxExperienceResolverRepository(),
    postgres: () => new PgRobloxExperienceResolverRepository(getPool()),
  });
}

export function createRobloxFriendsCacheRepository(): RobloxFriendsCacheRepository {
  return createRepository<RobloxFriendsCacheRepository>({
    supabase: () => new SupabaseRobloxFriendsCacheRepository(),
    postgres: () => new PgRobloxFriendsCacheRepository(getPool()),
  });
}

// Add createXxxRepository(...) wrappers here incrementally as repositories are introduced.
