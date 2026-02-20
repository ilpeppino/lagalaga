# Deployment Guide

This guide covers deploying the Lagalaga backend and app to production.

## Overview

The deployment consists of:
1. **Backend API** - Node.js/Fastify server (deploy to Render/Railway/Fly.io)
2. **Supabase Database** - PostgreSQL with migrations applied
3. **Roblox OAuth App** - Registered in Roblox Creator Dashboard
4. **Expo App** - React Native app published via EAS

## Part 1: Register Roblox OAuth App

### 1. Create OAuth App in Roblox

1. Go to the [Roblox Creator Dashboard](https://create.roblox.com/dashboard/credentials)
2. Navigate to **OAuth 2.0** section
3. Click **Create OAuth 2.0 App**
4. Fill in the details:
   - **App Name**: Lagalaga
   - **App Description**: Gaming session organizer for Roblox players
   - **Redirect URIs**: Add these:
     - `lagalaga://auth/roblox` (for mobile app)
     - `http://localhost:19006/auth/roblox` (for local testing on web)
   - **Scopes**: Select `openid` and `profile`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** - you'll need these

### 2. Save Credentials

Save these values in a secure location (password manager):
- `ROBLOX_CLIENT_ID`: The client ID from Roblox
- `ROBLOX_CLIENT_SECRET`: The client secret from Roblox

## Part 2: Deploy Backend API

### Option A: Deploy to Render

1. **Create Account**: Sign up at https://render.com
2. **Create Web Service**:
   - Click **New +** → **Web Service**
   - Connect your GitHub repository
   - Select the repository
3. **Configure Service**:
   - **Name**: `lagalaga-api`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
4. **Add Environment Variables**:
   ```
   NODE_ENV=production
   PORT=10000
   HOST=0.0.0.0
   SUPABASE_URL=<your-supabase-url>
   SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
   ROBLOX_CLIENT_ID=<from-step-1>
   ROBLOX_CLIENT_SECRET=<from-step-1>
   ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
   JWT_SECRET=<generate-random-32-char-string>
   JWT_EXPIRY=15m
   REFRESH_TOKEN_SECRET=<generate-different-random-32-char-string>
   REFRESH_TOKEN_EXPIRY=7d
   CORS_ORIGIN=*
   ```
5. **Deploy**: Click **Create Web Service**
6. **Copy URL**: Save your service URL (e.g., `https://lagalaga-api.onrender.com`)

### Option B: Deploy to Railway

1. **Create Account**: Sign up at https://railway.app
2. **Create New Project**:
   - Click **New Project** → **Deploy from GitHub repo**
   - Select your repository
3. **Configure Service**:
   - Railway will auto-detect Node.js
   - Set **Root Directory**: `backend`
4. **Add Environment Variables**: Same as Render (above)
5. **Deploy**: Railway will automatically deploy
6. **Add Domain**: Go to **Settings** → **Networking** → **Generate Domain**
7. **Copy URL**: Save your service URL

### Option C: Deploy to Fly.io

1. **Install Fly CLI**: `curl -L https://fly.io/install.sh | sh`
2. **Login**: `fly auth login`
3. **Create App**:
   ```bash
   cd backend
   fly launch --name lagalaga-api --region ord
   ```
4. **Set Secrets**:
   ```bash
   fly secrets set \
     NODE_ENV=production \
     SUPABASE_URL=<your-url> \
     SUPABASE_SERVICE_ROLE_KEY=<your-key> \
     ROBLOX_CLIENT_ID=<your-id> \
     ROBLOX_CLIENT_SECRET=<your-secret> \
     ROBLOX_REDIRECT_URI=lagalaga://auth/roblox \
     JWT_SECRET=<your-secret> \
     REFRESH_TOKEN_SECRET=<your-refresh-secret>
   ```
5. **Deploy**: `fly deploy`
6. **Get URL**: `fly info` (e.g., `https://lagalaga-api.fly.dev`)

### Generate JWT Secrets

Use Node.js to generate secure random strings:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this twice to get two different secrets for `JWT_SECRET` and `REFRESH_TOKEN_SECRET`.

## Part 3: Run Database Migration

Follow the steps in `docs/DATABASE_MIGRATION.md` to:
1. Create the `app_users` table
2. Add foreign key constraint to `sessions` table

## Part 4: Update Roblox OAuth Redirect URI

Now that you have your production backend URL:

1. Go back to [Roblox Creator Dashboard](https://create.roblox.com/dashboard/credentials)
2. Edit your OAuth app
3. Add your production callback URL to **Redirect URIs**:
   - `https://YOUR_BACKEND_URL/auth/roblox/callback`
4. Save changes

## Part 5: Configure Expo App for Production

### 1. Update Environment Variables

Create `.env.production`:

```bash
EXPO_PUBLIC_API_URL=https://your-backend-url.onrender.com
EXPO_PUBLIC_ROBLOX_CLIENT_ID=<your-roblox-client-id>
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
```

### 2. Update app.json

Ensure your `app.json` has the correct scheme:

```json
{
  "expo": {
    "scheme": "lagalaga",
    "ios": {
      "bundleIdentifier": "com.yourcompany.lagalaga"
    },
    "android": {
      "package": "com.yourcompany.lagalaga"
    }
  }
}
```

### 3. Install EAS CLI

```bash
npm install -g eas-cli
```

### 4. Configure EAS

```bash
eas login
eas build:configure
```

### 5. Build for Production

**For iOS:**
```bash
eas build --platform ios --profile production
```

**For Android:**
```bash
eas build --platform android --profile production
```

**For both:**
```bash
eas build --platform all --profile production
```

### 6. Submit to App Stores

**iOS (TestFlight/App Store):**
```bash
eas submit --platform ios
```

**Android (Google Play):**
```bash
eas submit --platform android
```

## Part 6: Testing Production Setup

### 1. Test Backend Health

```bash
curl https://your-backend-url.onrender.com/health
```

Should return:
```json
{"status":"ok","timestamp":"2024-..."}
```

### 2. Test OAuth Flow

1. Install the app on your device (from TestFlight or APK)
2. Tap "Sign in with Roblox"
3. Verify it redirects to Roblox
4. Approve the OAuth request
5. Verify you're redirected back to the app
6. Check you see the sessions list

### 3. Test Session Creation

1. Create a new session
2. Verify it appears in the sessions list
3. View session details
4. Test join/leave functionality

## Part 7: Monitoring & Logging

### Backend Monitoring

**Render:**
- View logs in Render Dashboard → Logs tab
- Set up log streaming to external service

**Railway:**
- View logs in Railway Dashboard → Deployment logs
- Set up external monitoring

**Fly.io:**
- View logs: `fly logs`
- Set up Sentry: Add `@sentry/node` to backend

### Error Tracking

Add Sentry to backend:

```bash
cd backend
npm install @sentry/node
```

Add to `server.ts`:

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

## Environment Variables Summary

### Backend (.env)

```bash
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
ROBLOX_CLIENT_ID=12345...
ROBLOX_CLIENT_SECRET=abc123...
ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
JWT_SECRET=<32-char-random-string>
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=<different-32-char-random-string>
REFRESH_TOKEN_EXPIRY=7d
CORS_ORIGIN=*
```

### App (.env.production)

```bash
EXPO_PUBLIC_API_URL=https://your-backend-url.onrender.com
EXPO_PUBLIC_ROBLOX_CLIENT_ID=12345...
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
```

## Security Checklist

- [ ] All environment variables are set correctly
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is NEVER exposed to the client
- [ ] JWT secrets are random and secure (32+ characters)
- [ ] CORS is configured appropriately (consider restricting in production)
- [ ] HTTPS is enabled on backend (automatic with Render/Railway/Fly.io)
- [ ] Roblox OAuth redirect URIs are whitelisted
- [ ] Database has proper foreign key constraints
- [ ] Error messages don't leak sensitive information in production

## Rollback Plan

If something goes wrong:

1. **Backend**: Revert to previous deployment in hosting dashboard
2. **App**: Use EAS Update to push OTA fix:
   ```bash
   eas update --branch production --message "Rollback to stable"
   ```
3. **Database**: Run rollback SQL from `docs/DATABASE_MIGRATION.md`

## Support

For issues:
- Backend logs: Check your hosting provider's dashboard
- App crashes: Check Sentry or Expo dashboard
- OAuth issues: Verify redirect URIs in Roblox dashboard
- Database issues: Check Supabase logs
