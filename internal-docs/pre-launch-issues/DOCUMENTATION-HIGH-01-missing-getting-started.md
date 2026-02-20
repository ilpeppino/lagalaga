# DOCUMENTATION: Missing Getting Started Guide

## Severity
🟡 **MEDIUM-HIGH**

## Category
Documentation / Developer Experience

## Description
No comprehensive getting started guide exists for new developers. The root README.md is a generic Expo template, and there's no single entry point for setting up the development environment.

## Current State
- Root `README.md` is generic Expo boilerplate
- `backend/README.md` has some setup instructions but incomplete
- No step-by-step setup guide for both frontend + backend
- New developers must piece together information from multiple files
- Missing prerequisite requirements
- No troubleshooting section

## Impact
- **Slow onboarding** for new developers (1-2 days instead of 1-2 hours)
- **Setup failures** without clear instructions
- **Inconsistent development environments**
- **Frustration** and reduced productivity
- **Increased support burden** answering repeated questions

## Recommended Fix

### Create `/docs/GETTING_STARTED.md`

```markdown
# Getting Started with LagaLaga

Welcome to LagaLaga! This guide will help you set up your development environment and get the app running locally.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18.x or higher ([Download](https://nodejs.org/))
- **npm**: v9.x or higher (comes with Node.js)
- **Expo CLI**: `npm install -g expo-cli`
- **Git**: For version control
- **iOS Simulator** (Mac only): Xcode with Command Line Tools
- **Android Studio** (for Android development): With Android SDK
- **Supabase CLI**: `npm install -g supabase` (optional, for local database)

### Accounts You'll Need
- **Supabase** account ([signup](https://supabase.com))
- **Roblox Developer** account ([creator hub](https://create.roblox.com))
- **Render** account for deployment (optional)

## Quick Start (5 minutes)

### 1. Clone the Repository
\`\`\`bash
git clone git@github.com:ilpeppino/lagalaga.git
cd lagalaga
\`\`\`

### 2. Install Dependencies

#### Frontend
\`\`\`bash
npm install
\`\`\`

#### Backend
\`\`\`bash
cd backend
npm install
cd ..
\`\`\`

### 3. Set Up Environment Variables

#### Frontend Environment
\`\`\`bash
# Copy example file
cp .env.example .env

# Edit .env with your values
# EXPO_PUBLIC_API_URL=http://localhost:3000
# EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
# EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
\`\`\`

#### Backend Environment
\`\`\`bash
cd backend
cp .env.example .env

# Edit backend/.env with your values
# See backend/README.md for required variables
\`\`\`

### 4. Start Development Servers

#### Terminal 1: Backend
\`\`\`bash
cd backend
npm run dev
\`\`\`
Backend will run on `http://localhost:3000`

#### Terminal 2: Frontend
\`\`\`bash
npm start
\`\`\`

### 5. Open the App

- **iOS Simulator**: Press `i` in the terminal
- **Android Emulator**: Press `a` in the terminal
- **Physical Device**: Scan QR code with Expo Go app

## Detailed Setup

### Setting Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API
3. Copy your project URL and anon key
4. Add to `.env` and `backend/.env`

#### Run Migrations
\`\`\`bash
cd backend
npx supabase db push
\`\`\`

### Setting Up Roblox OAuth

1. Go to [Roblox Creator Dashboard](https://create.roblox.com/credentials)
2. Create new OAuth2 application
3. Set redirect URI: `http://localhost:3000/auth/roblox/callback`
4. Copy Client ID and Client Secret
5. Add to `backend/.env`:
   \`\`\`
   ROBLOX_CLIENT_ID=your_client_id
   ROBLOX_CLIENT_SECRET=your_client_secret
   \`\`\`

### Database Setup

#### Option 1: Use Remote Supabase (Recommended)
Already configured if you followed Supabase setup above.

#### Option 2: Local Supabase
\`\`\`bash
cd backend
npx supabase init
npx supabase start
npx supabase db push
\`\`\`

## Verify Setup

### Check Backend Health
\`\`\`bash
curl http://localhost:3000/health
# Should return: {"status":"healthy"}
\`\`\`

### Check Frontend Connection
1. Open app in simulator/emulator
2. Navigate to sign in screen
3. Tap "Sign in with Roblox"
4. Should redirect to Roblox OAuth (or show error if config is wrong)

## Common Issues

### "Cannot connect to backend"
- Verify backend is running on port 3000
- Check `EXPO_PUBLIC_API_URL` in frontend `.env`
- Ensure no firewall blocking localhost

### "Supabase connection failed"
- Verify `SUPABASE_URL` and `SUPABASE_KEY` in backend `.env`
- Check Supabase project is active
- Verify API keys are correct

### "OAuth redirect not working"
- Ensure `ROBLOX_CLIENT_ID` and `ROBLOX_CLIENT_SECRET` are set
- Verify redirect URI matches in Roblox Creator Dashboard
- Check backend logs for OAuth errors

### "Database migrations failed"
- Ensure Supabase connection is working
- Try running migrations manually: `cd backend && npx supabase db push`
- Check migration files in `backend/supabase/migrations/`

## Next Steps

- **Read the architecture docs**: [docs/architecture.md](./architecture.md)
- **Learn the development workflow**: [docs/DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
- **Review error handling**: [docs/error-handling.md](./error-handling.md)
- **Check deployment guide**: [docs/deployment/DEPLOYMENT.md](./deployment/DEPLOYMENT.md)

## Need Help?

- Check [Troubleshooting Guide](./TROUBLESHOOTING.md)
- Review [FAQ](./FAQ.md)
- Ask in team Slack/Discord
- Open an issue on GitHub

## Development Tools

### Recommended VS Code Extensions
- ESLint
- Prettier
- React Native Tools
- Expo Tools
- GitLens

### Useful Commands
\`\`\`bash
# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Format code
npm run format
\`\`\`

## Code Structure

\`\`\`
lagalaga/
├── app/              # Expo Router screens
├── src/
│   ├── lib/          # Utilities (API client, logger, etc.)
│   ├── features/     # Feature modules (auth, sessions)
│   └── components/   # Reusable components
├── backend/
│   ├── src/
│   │   ├── routes/   # API routes
│   │   ├── services/ # Business logic
│   │   └── lib/      # Backend utilities
│   └── supabase/
│       └── migrations/  # Database migrations
└── shared/           # Shared types between frontend/backend
\`\`\`

---

**Welcome to the team! 🚀**
\`\`\`

## Implementation Checklist
- [ ] Create `docs/GETTING_STARTED.md` with content above
- [ ] Create `.env.example` for frontend
- [ ] Create `backend/.env.example` for backend
- [ ] Update root `README.md` to link to getting started guide
- [ ] Add troubleshooting section
- [ ] Add FAQ section
- [ ] Create VS Code workspace settings example
- [ ] Test setup process on fresh machine
- [ ] Get feedback from new developer

## Additional Documentation Needed
1. **DEVELOPMENT_WORKFLOW.md** - How to work on features, Git workflow
2. **TROUBLESHOOTING.md** - Common issues and solutions
3. **FAQ.md** - Frequently asked questions
4. **API_REFERENCE.md** - Complete endpoint documentation
5. **TESTING_GUIDE.md** - How to write and run tests

## References
- Good examples: [React Native docs](https://reactnative.dev/docs/getting-started), [Next.js docs](https://nextjs.org/docs/getting-started)

## Priority
**P1 - High** - Improves developer productivity

## Estimated Effort
4-6 hours (writing + testing with fresh setup)
