# Invite Links

## What link to share

The backend generates shareable HTTPS invite links in the form:

```
https://ilpeppino.github.io/lagalaga/invite/?code=<INVITE_CODE>
```

This link is returned by the API as `inviteLink` and is shared via the native Share sheet in the session detail screen.

---

## How the link works

1. **App installed (Android App Links)** — Android opens Lagalaga directly if
   `assetlinks.json` is verified and the app is installed. The app receives the
   HTTPS URL, extracts `?code=`, and navigates to the invite screen.

2. **Browser fallback** — The GitHub Pages landing page at
   `docs/invite/index.html` fires `lagalaga://invite/<code>`. If the app is
   installed the OS intercepts the custom scheme and opens it. After ~1.2 s, the
   page falls back to the Play Store listing.

3. **App not installed** — User is redirected to the Google Play Store listing
   for `com.ilpeppino.lagalaga`.

---

## Files involved

| File | Purpose |
|------|---------|
| `docs/invite/index.html` | GH Pages landing page (redirect logic) |
| `docs/.well-known/assetlinks.json` | Android App Links verification |
| `docs/.nojekyll` | Allows Jekyll to serve `.well-known/` |
| `app.config.ts` — `android.intentFilters` | Registers the HTTPS intent filter with `autoVerify: true` |
| `backend/src/services/sessionService-v2.ts` | Generates `inviteLink` as HTTPS URL |
| `src/lib/deepLinking.ts` — `extractInviteCodeFromUrl()` | Parses both scheme and HTTPS invite URLs |
| `app/_layout.tsx` | Handles HTTPS App Link URLs at app open |

---

## Manual step — paste SHA-256 from Play Console

`assetlinks.json` contains a placeholder `"PASTE_PLAY_APP_SIGNING_SHA256_HERE"`.

**To fill it in:**

1. Go to [Google Play Console](https://play.google.com/console) → your app →
   **Release → Setup → App signing**.
2. Copy the **SHA-256 certificate fingerprint** listed under *App signing key certificate*.
3. Open `docs/.well-known/assetlinks.json` and replace the placeholder string
   with the copied fingerprint (format: `AB:CD:EF:...` — 32 colon-separated hex pairs).
4. Commit and push so GitHub Pages serves the updated file.

---

## Verify assetlinks.json is reachable

After pushing, confirm the file is served:

```
curl -s https://ilpeppino.github.io/lagalaga/.well-known/assetlinks.json
```

The response must be valid JSON containing your SHA-256 fingerprint.

---

## GitHub Pages setup (one-time)

In the repository **Settings → Pages**:
- Source: **Deploy from a branch**
- Branch: `main` / `docs` folder

---

## Test checklist

- [ ] `https://ilpeppino.github.io/lagalaga/.well-known/assetlinks.json` returns valid JSON with the correct SHA-256
- [ ] `https://ilpeppino.github.io/lagalaga/invite/?code=TEST` loads the landing page
- [ ] Shared message contains the HTTPS link (not a `lagalaga://` scheme link)
- [ ] **Android — app installed:** tapping the HTTPS link opens Lagalaga directly on the invite screen
- [ ] **Android — app not installed:** tapping the HTTPS link opens the Google Play Store listing
- [ ] **GH Pages fallback:** opening the landing page in a browser without the app opens the Play Store after ~3 s
