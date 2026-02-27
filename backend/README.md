# Lagalaga Backend API

Backend API for the Lagalaga app, providing secure authentication via Roblox OAuth and session management.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

3. Run database migrations in Supabase SQL editor:
```bash
cat migrations/001_create_app_users.sql
# Copy and paste into Supabase SQL editor
```

## Development

Start the development server:
```bash
npm run dev
```

The server will run on `http://localhost:3001` by default.

## API Endpoints

### Authentication

- `POST /auth/roblox/start` - Generate Roblox OAuth authorization URL
- `POST /auth/roblox/callback` - Exchange authorization code for JWT
- `POST /auth/refresh` - Refresh expired access token
- `POST /auth/revoke` - Sign out (revoke token)
- `GET /auth/me` - Get current user info (requires authentication)
- `GET /api/auth/google/start` - Generate Google OAuth authorization URL (PKCE + state)
- `POST /api/auth/google/callback` - Exchange Google code for app JWT session tokens

### Account Linking Model

- `user_platforms` is the canonical identity mapping table.
- `(platform_id, platform_user_id)` is globally unique and determines account ownership.
- Login resolution:
  - Google callback: use existing `('google', sub)` link or create new `app_users` + link.
  - Roblox callback: use existing `('roblox', userId)` link or create new `app_users` + link.
- Connect resolution (authenticated user):
  - Linking a platform identity already linked to a different `app_users.id` returns `409 ACCOUNT_LINK_CONFLICT`.
  - No automatic account merges are performed.

### Link Conflict Errors

- `ACCOUNT_LINK_CONFLICT` (`409`): provider identity belongs to another account.
- `ACCOUNT_LINK_SAME_PROVIDER_DUPLICATE` (`409`): duplicate provider link anomaly.
- `ACCOUNT_LINK_INVALID_STATE` (`401`): missing/expired OAuth state during account-link flow.

### Account Recovery

- Automatic merges are intentionally disabled for safety.
- Users must sign in with the original provider.
- If they cannot access the original method, route to support for manual recovery.

### Health

- `GET /health` - Server health check

## Architecture

- **Fastify** - Fast web framework
- **@fastify/jwt** - JWT authentication
- **@supabase/supabase-js** - Database client (service_role)
- **undici** - HTTP client for Roblox API

## Security

- Uses Supabase `service_role` key (never exposed to client)
- Implements OAuth 2.0 with PKCE for secure authorization
- Short-lived access tokens (15 min) with refresh tokens (7 days)
- State parameter for CSRF protection
