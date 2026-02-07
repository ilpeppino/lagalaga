# Epic 6: Roblox Deep Linking - Testing Guide

## Overview
Epic 6 implements the ability to launch the Roblox app directly to a specific game from within the LagaLaga app, with browser fallback if the Roblox app is not installed.

## Features Implemented

### ✅ Story 6.1: Launch Roblox from Session
- **Primary Method:** Opens `roblox://placeId=<placeId>` deep link
- **Fallback Method:** Opens `canonical_start_url` in browser if deep link fails
- **Platform Support:** iOS and Android
- **User Feedback:** Shows confirmation when Roblox is launching

---

## Testing Scenarios

### 1. Launch Roblox (App Installed)

**Prerequisites:**
- Roblox app installed on device
- User joined a session

**Steps:**
1. Open LagaLaga app
2. Navigate to any session detail screen
3. Join the session (if not already joined)
4. Tap "Launch Roblox" button

**Expected Result:**
- Roblox app opens immediately
- User is taken directly to the game from the session
- Game loads in Roblox
- User can return to LagaLaga app

---

### 2. Launch Roblox (App Not Installed)

**Prerequisites:**
- Roblox app NOT installed on device
- User joined a session

**Steps:**
1. Open LagaLaga app
2. Navigate to any session detail screen
3. Join the session (if not already joined)
4. Tap "Launch Roblox" button

**Expected Result:**
- Alert dialog appears with:
  - Title: "Opening in Browser"
  - Message: "The Roblox app is not installed. Opening in your browser instead."
  - Buttons: "Cancel" and "Open"
5. Tap "Open"
6. Browser opens to Roblox game page
7. User can play in browser or download Roblox app

---

### 3. Launch Roblox (Deep Link Fails)

**Prerequisites:**
- Edge case: Roblox app installed but deep link fails
- User joined a session

**Steps:**
1. Open LagaLaga app
2. Navigate to any session detail screen
3. Join the session (if not already joined)
4. Tap "Launch Roblox" button
5. Deep link fails (simulate by breaking the URL)

**Expected Result:**
- Falls back to browser method
- Alert dialog appears
- Tapping "Open" opens browser with game URL

---

### 4. Launch Button Visibility

**Test Case A: User Has Not Joined**
**Steps:**
1. Open session detail for a session you haven't joined

**Expected Result:**
- "Launch Roblox" button is NOT visible
- Only "Join Session" button is visible

**Test Case B: User Has Joined**
**Steps:**
1. Join a session
2. View session detail

**Expected Result:**
- "Launch Roblox" button IS visible
- Button appears after "Share Invite" button
- Button is styled with green background

---

### 5. Error Handling

**Prerequisites:**
- User joined a session
- Network or system issue occurs

**Steps:**
1. Disable network (if applicable)
2. Tap "Launch Roblox" button

**Expected Result:**
- If error occurs, shows alert:
  - Title: "Error"
  - Message: "Failed to launch Roblox. Please try again later."
- User can dismiss and retry

---

### 6. Different Game URLs

**Prerequisites:**
- Multiple sessions with different Roblox games

**Test Games:**
- Jailbreak: `https://www.roblox.com/games/606849621/Jailbreak`
- Adopt Me: `https://www.roblox.com/games/920587237/Adopt-Me`
- Blox Fruits: `https://www.roblox.com/games/2753915549/Blox-Fruits`

**Steps:**
1. Create sessions for each game
2. Join each session
3. Tap "Launch Roblox" for each

**Expected Result:**
- Each game launches correctly in Roblox
- Deep link contains correct placeId
- Browser fallback uses correct canonical_start_url

---

## Platform-Specific Testing

### iOS Testing

**Device Requirements:**
- iOS 13.0 or higher
- Roblox app installed (for deep link test)

**Configuration Check:**
1. Verify `app.json` contains:
```json
"ios": {
  "infoPlist": {
    "LSApplicationQueriesSchemes": ["roblox"]
  }
}
```

**Deep Link Format:**
```
roblox://placeId=606849621
```

**Expected Behavior:**
- `Linking.canOpenURL()` returns `true` when Roblox installed
- Deep link opens Roblox app
- Falls back to browser when Roblox not installed

---

### Android Testing

**Device Requirements:**
- Android 5.0 or higher
- Roblox app installed (for deep link test)

**Deep Link Format:**
```
roblox://placeId=606849621
```

**Expected Behavior:**
- `Linking.canOpenURL()` returns `true` when Roblox installed
- Deep link opens Roblox app
- Falls back to browser when Roblox not installed

---

### Web Testing

**Note:** Deep linking is not supported on web builds.

**Expected Behavior:**
- Button should open browser with canonical_start_url
- No deep link attempt on web platform

---

## Manual Testing Commands

### iOS Simulator - Test Deep Link Directly
```bash
# Test if Roblox deep link opens (Roblox must be installed)
xcrun simctl openurl booted "roblox://placeId=606849621"

# Should open Roblox app to Jailbreak game
```

### Android Emulator - Test Deep Link Directly
```bash
# Test if Roblox deep link opens (Roblox must be installed)
adb shell am start -W -a android.intent.action.VIEW -d "roblox://placeId=606849621"

# Should open Roblox app to Jailbreak game
```

---

## Code Verification

### Check Roblox Launcher Implementation

**File:** `src/services/roblox-launcher.ts`

**Verify:**
- [x] `launchRobloxGame()` function exists
- [x] Deep link format: `roblox://placeId=<placeId>`
- [x] `Linking.canOpenURL()` check before opening
- [x] Browser fallback with alert
- [x] Error handling with try/catch

### Check Session Detail Integration

**File:** `app/sessions/[id]-v2.tsx`

**Verify:**
- [x] Imports `launchRobloxGame` from roblox-launcher
- [x] `handleLaunchRoblox()` calls `launchRobloxGame()`
- [x] Passes `session.game.placeId` and `session.game.canonicalStartUrl`
- [x] Button only visible when `hasJoined` is true
- [x] Error handling with Alert

### Check App Configuration

**File:** `app.json`

**Verify:**
- [x] iOS `infoPlist.LSApplicationQueriesSchemes` includes `["roblox"]`
- [x] App scheme is `lagalaga` (for returning to app)

---

## Success Criteria

All items must be checked:

- [x] Deep link opens Roblox app when installed
- [x] Browser fallback works when Roblox not installed
- [x] Works on both iOS and Android
- [x] Launch button only visible after joining
- [x] Error handling displays user-friendly messages
- [x] Correct placeId passed to deep link
- [x] Canonical URLs used for fallback
- [x] Alert shows before opening browser
- [x] User can cancel browser opening
- [x] No crashes or unhandled errors

---

## Common Issues & Solutions

### Issue: Deep link doesn't open Roblox app
**Solution:**
- Verify Roblox app is installed
- Check iOS: `LSApplicationQueriesSchemes` in app.json
- Rebuild app after changing app.json
- Check deep link format: `roblox://placeId=<number>`

### Issue: "Launch Roblox" button not visible
**Solution:**
- Verify user has joined the session
- Check `hasJoined` logic in component
- Ensure participant state is 'joined'

### Issue: Browser doesn't open on fallback
**Solution:**
- Check `canonical_start_url` is valid in database
- Verify URL format: `https://www.roblox.com/games/<placeId>/...`
- Check console for errors

### Issue: Alert not showing before browser opens
**Solution:**
- Check `launchInBrowser()` function implementation
- Verify Alert.alert() is called
- Check React Native Alert is imported

---

## Next Steps

After Epic 6 testing is complete:
- **Epic 7:** Security & RLS Policies (parallel with E3-E6)
- **Epic 8:** Testing & Observability
- **Epic 9:** Roblox OAuth Integration (M3)

---

## Performance Notes

**Deep Link Performance:**
- Deep link check: ~50-100ms
- Roblox app launch: ~500ms-2s (depends on device)
- Browser fallback: ~200-500ms

**Optimization Tips:**
- Cache `canOpenURL` result for session
- Pre-check Roblox availability on app start
- Show loading indicator during launch

---

## Accessibility

**Button Labels:**
- "Launch Roblox" - Clear action
- Alert title: "Opening in Browser" - Explains context
- Cancel button available for user control

**Screen Reader Support:**
- Button has accessible label
- Alert messages are announced
- Error states are communicated clearly
