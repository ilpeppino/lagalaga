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
