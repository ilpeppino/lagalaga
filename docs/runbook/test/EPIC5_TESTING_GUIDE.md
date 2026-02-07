# Epic 5: Session Join Flow - Testing Guide

## Overview
Epic 5 implements the complete session join flow with deep link support for invite codes.

## Features Implemented

### ✅ Story 5.1: Join Session API
- **Endpoint:** `POST /api/sessions/:id/join`
- **Status:** Completed in Epic 3
- Validates session capacity
- Validates user permissions
- Checks if user already joined
- Handles invite codes

### ✅ Story 5.2: Join via Invite Link
- **Deep Link:** `lagalaga://invite/:code`
- **Screen:** `/app/invite/[code].tsx`
- Fetches session by invite code
- Auto-joins authenticated users
- Prompts login for unauthenticated users
- Shows session preview
- Handles full sessions gracefully

---

## Testing Scenarios

### 1. Create Session and Get Invite Link

**Prerequisites:** User must be logged in

**Steps:**
1. Open app and navigate to "Create Session" (`/sessions/create-v2`)
2. Paste any Roblox game URL (e.g., `https://www.roblox.com/games/606849621/Jailbreak`)
3. Fill in:
   - Title: "Test Session"
   - Description: "Testing invite flow"
   - Visibility: "Public"
   - Max Participants: 5
4. Tap "Create Session"
5. Note the invite link from the success prompt (format: `lagalaga://invite/ABC123XYZ`)

**Expected Result:**
- Session created successfully
- Invite link displayed
- Option to share invite link

---

### 2. Join via Deep Link (Authenticated)

**Prerequisites:**
- User must be logged in
- Valid invite code from Test 1

**Steps:**
1. Copy the invite link from Test 1
2. On iOS Simulator: `xcrun simctl openurl booted "lagalaga://invite/ABC123XYZ"`
3. On Android: `adb shell am start -W -a android.intent.action.VIEW -d "lagalaga://invite/ABC123XYZ"`
4. Or paste link in device browser and open

**Expected Result:**
- App opens to invite screen
- Shows "Joining session..." loading state
- Auto-joins session
- Navigates to session detail screen
- User appears in participant list

---

### 3. Join via Deep Link (Unauthenticated)

**Prerequisites:**
- User must be logged out
- Valid invite code

**Steps:**
1. Log out from app
2. Open deep link: `lagalaga://invite/ABC123XYZ`

**Expected Result:**
- App opens to invite screen
- Shows session preview with:
  - Game thumbnail
  - Session title
  - Game name
  - Participant count
- Shows "Sign In to Join" button
- Shows "View Session" button

**Actions Available:**
- Tap "Sign In to Join" → Navigates to login
- Tap "View Session" → Shows session detail (read-only)

---

### 4. Join Full Session

**Prerequisites:**
- Session at maximum capacity

**Steps:**
1. Create session with max 2 participants
2. Join with first user
3. Join with second user (reaches capacity)
4. Try to join with third user using invite link

**Expected Result:**
- Shows session preview
- Shows "FULL" badge
- Shows "This session is full" message
- Join button disabled
- "View Session Anyway" button available

---

### 5. Already Joined Session

**Prerequisites:**
- User already in session

**Steps:**
1. Join session via invite link
2. Use same invite link again

**Expected Result:**
- Shows "already joined" message or silently navigates to session
- No error displayed to user
- User still appears in participant list

---

### 6. Invalid Invite Code

**Steps:**
1. Open invalid invite link: `lagalaga://invite/INVALID123`

**Expected Result:**
- Shows error icon (red X)
- Title: "Invalid Invite"
- Message: "This invite link is not valid or has expired"
- "Go Back" button available

---

### 7. Share Invite Link

**Prerequisites:**
- Session created

**Steps:**
1. Open session detail
2. Tap "Share Invite" button
3. Select share destination (Messages, Email, etc.)

**Expected Result:**
- Native share sheet opens
- Message includes:
  - Session title
  - Game name
  - Invite link

**Share Message Format:**
```
Join my Jailbreak session: "Test Session"

lagalaga://invite/ABC123XYZ
```

---

### 8. Return to App After Login

**Prerequisites:**
- Unauthenticated user
- Valid invite link

**Steps:**
1. Log out
2. Open invite link
3. Tap "Sign In to Join"
4. Complete login flow
5. App should return to invite

**Expected Result:**
- After login, auto-joins session
- Navigates to session detail
- User appears in participant list

**Note:** This requires implementing `returnTo` parameter handling in auth flow.

---

## Deep Link Formats

### Invite Link
```
lagalaga://invite/:code

Example:
lagalaga://invite/ABC123XYZ
```

### Session Detail
```
lagalaga://sessions/:id

Example:
lagalaga://sessions/550e8400-e29b-41d4-a716-446655440000
```

---

## Testing on Different Platforms

### iOS Simulator
```bash
# Open invite link
xcrun simctl openurl booted "lagalaga://invite/ABC123XYZ"

# Open session detail
xcrun simctl openurl booted "lagalaga://sessions/SESSION_ID"
```

### Android Emulator
```bash
# Open invite link
adb shell am start -W -a android.intent.action.VIEW -d "lagalaga://invite/ABC123XYZ"

# Open session detail
adb shell am start -W -a android.intent.action.VIEW -d "lagalaga://sessions/SESSION_ID"
```

### Web Browser
Open the deep link in a browser on a device with the app installed:
```
lagalaga://invite/ABC123XYZ
```

The browser will prompt to open the app.

---

## API Testing

### Test Join Endpoint Directly

**Request:**
```bash
curl -X POST http://localhost:3001/api/sessions/SESSION_ID/join \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inviteCode": "ABC123XYZ"}'
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "currentParticipants": 2,
      "participants": [...]
    }
  }
}
```

**Error Responses:**

Session Full (400):
```json
{
  "success": false,
  "error": {
    "code": "SESSION_FULL",
    "message": "This session is at maximum capacity"
  }
}
```

Invalid Invite (400):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Invalid invite code"
  }
}
```

Already Joined (400):
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "You have already joined this session"
  }
}
```

---

## Common Issues & Solutions

### Issue: Deep link doesn't open app
**Solution:**
- Verify app.json has `"scheme": "lagalaga"`
- Rebuild app after changing scheme
- On iOS: Uninstall and reinstall app
- Check URL format is correct

### Issue: "Invalid invite" error
**Solution:**
- Verify invite code exists in database
- Check invite hasn't expired
- Verify invite hasn't exceeded max uses
- Check network connectivity

### Issue: User not auto-joining
**Solution:**
- Verify user is authenticated
- Check auth token is valid
- Verify session has capacity
- Check console for errors

### Issue: Session appears full but has space
**Solution:**
- Check participant count calculation
- Verify `state='joined'` filter in query
- Check for duplicate participant records

---

## Success Criteria

- [x] User can join session via invite link
- [x] Authenticated users auto-join
- [x] Unauthenticated users see login prompt
- [x] Session preview displays correctly
- [x] Full sessions show appropriate message
- [x] Invalid invites show error state
- [x] Share functionality works
- [x] Deep links open app correctly
- [x] Join validation works (capacity, permissions)
- [x] Participant list updates after join

---

## Next Steps

After Epic 5 testing is complete:
- **Epic 6:** Roblox Deep Linking (launch game from app)
- **Epic 7:** Security & RLS Policies
- **Epic 8:** Testing & Observability
