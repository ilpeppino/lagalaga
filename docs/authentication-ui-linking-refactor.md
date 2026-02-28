# Authentication UI and Linking Refactor

## 1. Updated Login Screen Component Structure

### iOS (`app/auth/sign-in.tsx`)
- Primary CTA: `Continue with Roblox`
- Divider row: `OR`
- Secondary CTA: Apple native button (`Sign in with Apple`)
- Helper copy:
  - `If you sign in with Apple, you will need to connect your Roblox account to use Lagalaga.`

### Android (`app/auth/sign-in.tsx`)
- Primary CTA: `Continue with Roblox`
- Secondary CTA: `Continue with Google`

### Mandatory linking screen (`app/auth/connect-roblox.tsx`)
- Primary CTA: `Connect Roblox Account`
- Secondary action: `Sign out`
- No skip path to app content

## 2. Auth Decision Tree (Pseudo-code)

```text
if platform == iOS:
  show Roblox primary + Apple secondary
else:
  show Roblox primary + Google secondary

on Roblox success:
  login and route to app

on Apple success:
  call /api/auth/apple/callback
  if me.robloxConnected == false:
    route /auth/connect-roblox (mandatory)
  else:
    route /sessions

global guard:
  if authenticated && robloxConnected == false:
    force route /auth/connect-roblox
```

## 3. Backend Linking Logic Flow

### Apple callback (`backend/src/routes/roblox-connect.routes.ts`)
- Validate Apple identity token
- Optionally resolve authenticated user from bearer token
- Resolve account in `AppleAuthService`:
  - If Apple `sub` already linked:
    - return existing user
    - if bearer user exists and differs -> conflict
  - Else if bearer user exists:
    - link Apple identity to bearer user (explicit linking)
  - Else:
    - create new app user (Apple-first path)
- Issue JWT pair for resolved user

### Roblox linking callback (`/api/auth/roblox/callback`)
- Authenticated-only endpoint
- Links Roblox identity to `request.user.userId`
- Prevents cross-user link conflicts

## 4. Error Code Addition

- New standardized code supported: `CONFLICT_ACCOUNT_PROVIDER`
- Existing code retained for compatibility: `ACCOUNT_LINK_CONFLICT`
- Frontend conflict handler accepts both codes.

## 5. UX Copy

- iOS helper copy on sign-in:
  - `If you sign in with Apple, you will need to connect your Roblox account to use Lagalaga.`
- Account screen (iOS + Roblox-connected):
  - `Link your Apple account for easier login.`
  - Button: `Link Apple Account`
- Conflict message:
  - `This account is already linked to another LagaLaga account.`

## 6. State Diagram

```text
[Signed Out]
   | Roblox login
   v
[Authenticated + Roblox Linked] -----------------------------.
   | iOS: Link Apple from account                            |
   v                                                         |
[Authenticated + Apple+Roblox Linked]                        |
   ^                                                         |
   | Apple login (already linked)                            |
   '---------------------------------------------------------'

[Signed Out]
   | iOS Apple login (new Apple identity)
   v
[Authenticated + Apple only]
   | mandatory route guard
   v
[Connect Roblox Screen]
   | Roblox connect success
   v
[Authenticated + Apple+Roblox Linked]
```
