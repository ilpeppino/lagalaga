export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ES2022',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
        },
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 65,
      lines: 65,
      statements: 65,
    },
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/routes/account.routes.ts',
    'src/routes/leaderboard.routes.ts',
    'src/routes/me.routes.ts',
    'src/routes/presence.routes.ts',
    'src/routes/reports.routes.ts',
    'src/routes/roblox.ts',
    'src/routes/sessions-v2.ts',
    'src/services/leaderboardService.ts',
    'src/services/roblox-enrichment.service.ts',
    'src/services/roblox-experience-resolver.service.ts',
    'src/services/roblox-experience-resolver.ts',
    'src/services/roblox-favorites.service.ts',
    'src/services/roblox-friends-cache.service.ts',
    'src/services/roblox-link-normalizer.ts',
    'src/services/roblox-presence.service.ts',
    'src/utils/errors.ts',
    'src/plugins/errorHandler.ts',
  ],
};
