# Repository Guidelines

## Project Structure & Module Organization
- Mobile app (Expo + React Native) lives at the repo root: routes in `app/`, reusable UI in `components/`, hooks in `hooks/`, shared client logic in `src/`, and static assets in `assets/`.
- Backend API lives in `backend/`: Fastify server code in `backend/src/`, tests in `backend/src/**/__tests__/`, migrations in `backend/migrations/`.
- Shared cross-runtime types/errors are in `shared/`. Supabase SQL migrations are in `supabase/migrations/`. Operational docs and runbooks are in `docs/`.

## Build, Test, and Development Commands
- `npm run start` starts the Expo app.
- `npm run ios` / `npm run android` runs native builds locally.
- `npm run lint` runs Expo ESLint checks for the app.
- `npm run generate:assets` regenerates app icons/splash assets.
- `cd backend && npm run dev` starts backend in watch mode.
- `cd backend && npm run build` compiles backend TypeScript.
- `cd backend && npm run test` runs backend Jest tests.
- `cd backend && npm run test:coverage` runs tests with coverage gates.

## Coding Style & Naming Conventions
- TypeScript is strict (`tsconfig.json`), prefer explicit types on public APIs.
- Use 2-space indentation and trailing semicolons, matching existing files.
- File naming patterns:
  - React components: `PascalCase.tsx` (for example `ErrorBoundary.tsx`).
  - Utilities/services/hooks: `camelCase.ts` or kebab-case service files (for example `roblox-friends.service.ts`).
  - Route files follow Expo Router conventions (for example `app/sessions/[id].tsx`).
- Run `npm run lint` before opening a PR.

## Testing Guidelines
- Backend uses Jest + ts-jest ESM config (`backend/jest.config.js`).
- Test files must match `**/*.test.ts` or `__tests__/**/*.test.ts`.
- Global backend coverage threshold is 90% for branches/functions/lines/statements.
- Add integration tests for route changes and unit tests for new services.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style used in history: `feat(scope): ...`, `fix: ...`, `test: ...`.
- Keep commits focused; separate schema/migration changes from app behavior when possible.
- PRs should include:
  - Short problem/solution summary.
  - Linked issue or task ID.
  - Test evidence (`npm run lint`, backend test command output).
  - Screenshots/video for UI changes and migration notes for DB updates.

## Security & Configuration Tips
- Never commit secrets; keep `.env` local and maintain `.env.example`.
- Validate all DB changes through `supabase/migrations/` and document rollout/rollback steps in `docs/runbook/` when applicable.
