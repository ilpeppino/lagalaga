# App Store Compliance Review — Lagalaga

**Date:** 2026-03-03
**Scope:** iOS App Store submission readiness against Apple App Review Guidelines
**References:** [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)

---

## Executive Summary

The app has strong foundations for compliance: Apple Sign In is implemented, account deletion is fully in-app, the privacy manifest is configured, and there are no in-app purchases or active tracking SDKs. However, **two Expo boilerplate screens remain in production navigation** and will cause an immediate rejection under Guideline 2.1 (App Completeness). Several other issues require attention before submission.

---

## BLOCKING ISSUES

Issues that will result in rejection or removal from the App Store.

---

### BLK-1 · Expo Template Placeholder Screens Visible to Reviewers

**Guideline:** 2.1 — App Completeness
**Severity:** 🔴 BLOCKING

Two Expo starter template screens are live in the main tab navigation and will be the first thing an App Review engineer sees after signing in.

**`app/(tabs)/index.tsx` — Home tab**

Contains unmodified Expo boilerplate:

- Header image: `partial-react-logo.png` (React logo)
- Text: `"Step 1: Try it — Edit app/(tabs)/index.tsx to see changes"`
- Text: `"Press cmd+d to open developer tools"`
- Text: `"Step 2: Explore"` / `"Step 3: Get a fresh start"`
- Text: `"When you're ready, run npm run reset-project to get a fresh app directory"`

**`app/(tabs)/explore.tsx` — Explore tab**

Contains unmodified Expo boilerplate:

- Text: `"This app includes example code to help you get started."`
- Collapsible: `"File-based routing"` describing Expo internals
- Collapsible: `"Images"` showing a React logo image
- External links to `docs.expo.dev` and `reactnative.dev`

**Required action:** Replace both screens with real app content before submission. The Home tab (`index.tsx`) already has a "Play Now" button wired to real session logic — the boilerplate text and placeholder image around it need to be removed. The Explore tab needs to be either replaced with real content or removed from navigation.

---

### BLK-2 · Development Test Screen Accessible via Route

**Guideline:** 2.3.1(a) — Hidden or Undocumented Features
**Severity:** 🔴 BLOCKING

`app/test-paper.tsx` is a UI component test harness accessible at the route `/test-paper`. It is not linked in the navigation but is reachable via deep link (`lagalaga://test-paper`) and by any path-based routing that Apple reviewers might probe.

The screen is titled "Paper Primitives Test" and shows raw UI component scaffolding with no user-facing purpose.

**Required action:** Delete `app/test-paper.tsx` before building the production binary. If needed for development, gate it behind a dev-only variant check (`if (__DEV__)`) or keep it only in the `dev` EAS build profile.

---

## HIGH PRIORITY (Likely to Delay or Block Review)

Issues that may not cause an immediate rejection but create significant risk.

---

### HP-1 · Age Rating Questions Must Be Updated by January 31, 2026

**Guideline:** 2.3.6 — Age Ratings
**Upcoming requirement deadline:** January 31, 2026
**Severity:** 🟠 HIGH

Apple introduced a new age rating system for iOS 26 / iPadOS 26. All apps must respond to the updated age rating questionnaire in App Store Connect by January 31, 2026. Apps that have not completed this by the deadline may be removed from the store.

Lagalaga is a social coordination app tied to Roblox (a 13+ platform). Given that the app:
- Displays user-generated session titles and descriptions
- Has a social/community dimension (friends, invites)
- Includes a safety reporting system explicitly covering CSAM and grooming

The age rating will likely be **12+** or **17+** depending on how Apple classifies user-generated content and mild/moderate references to violence in the gaming context. The questionnaire answers must accurately reflect all content categories.

**Required action:**
1. Log into App Store Connect and complete the new age rating questionnaire before January 31, 2026.
2. Review each content descriptor carefully — do not under-rate to gain broader audience.
3. Document the chosen rating and justification internally.

---

### HP-2 · EU Digital Services Act (DSA) Trader Status Not Confirmed

**Upcoming requirement:** Effective February 17, 2025 (already in effect)
**Severity:** 🟠 HIGH

Apps without a declared DSA trader status have been removed from the EU App Store since February 17, 2025. This must be set in App Store Connect under your developer account.

**Required action:** Declare whether you are a "trader" or "non-trader" under the DSA in App Store Connect. For an individual developer publishing a free app, this is typically a non-trader declaration. Without this, the app cannot be distributed in EU countries.

---

### HP-3 · Xcode 16 / iOS 18 SDK Required for Submission

**Upcoming requirement:** Effective April 24, 2025 (already in effect)
**Severity:** 🟠 HIGH

All app submissions must be built with Xcode 16 or later targeting the iOS 18 SDK. EAS Build uses Xcode versions specified in the build profile; this must be verified before submitting.

**Required action:** Confirm that the EAS production build profile uses Xcode 16+. Add the following to `eas.json` if not already configured:

```json
"production": {
  "autoIncrement": true,
  "env": { "APP_VARIANT": "prod" },
  "ios": {
    "image": "latest"
  }
}
```

Check the EAS Build logs on the Expo dashboard to confirm the Xcode version used in the last production build.

---

## MEDIUM PRIORITY (Should Be Addressed Before Launch)

Issues that represent compliance risk but are unlikely to block an initial review.

---

### MP-1 · Privacy Policy Must Enumerate All Third-Party SDKs With Data Access

**Guideline:** 5.1.1 — Privacy Policies
**Severity:** 🟡 MEDIUM

Apple requires the privacy policy to identify all third parties that have access to user data, including analytics providers, SDKs, and infrastructure partners. The current privacy policy at `https://ilpeppino.github.io/lagalaga/privacy-policy.html` should be audited against the following SDKs that process or store data:

| SDK | Data processed |
|-----|---------------|
| Supabase (`@supabase/supabase-js`) | User email, Roblox ID, session data, push tokens |
| Expo Notifications | Push token registered with Expo's push service (EPN) |
| `@react-native-async-storage/async-storage` | Local app state |
| `expo-secure-store` | OAuth tokens stored on-device |

**Required action:** Ensure the privacy policy names Supabase and Expo's push notification service as data processors and describes what data is shared with each.

---

### MP-2 · App Store Connect Requires a Support URL and Contact Method

**Guideline:** 1.5 — Developer Information
**Severity:** 🟡 MEDIUM

App Store Connect metadata requires a valid **Support URL** where users can get help. This URL must be live and functional at time of review.

Additionally, the app must provide an easy way for users to contact support from within the app or from the support page. The current `me.tsx` screen links to Privacy Policy and Terms of Service but has no visible path to contact support.

**Required action:**
1. Set a Support URL in App Store Connect (e.g., a GitHub Issues page, a contact form, or a dedicated support page).
2. Consider adding a "Contact Support" link in the Me screen's legal/settings section.

---

### MP-3 · App Store Metadata Must Not Contain Placeholder or Misleading Content

**Guideline:** 2.3 — Accurate Metadata
**Severity:** 🟡 MEDIUM

All App Store Connect fields — description, keywords, screenshots, preview videos — must accurately represent the app's actual functionality at the time of submission.

Screenshots must show:
- The real Home tab content (after BLK-1 is fixed)
- Apple Sign In button visible on the sign-in screen
- The in-app Roblox auth session (not a Safari browser)
- Core features: session creation, friends list, invites

Screenshots must not show:
- Any Expo boilerplate or placeholder content
- External browser windows for OAuth flows
- Debug overlays, console logs, or developer tools

**Required action:** Capture final screenshots on a physical iPhone running the production build after all placeholder content is removed.

---

### MP-4 · Roblox Brand Asset Usage Requires Verification

**Guideline:** 5.2.1 — Intellectual Property
**Severity:** 🟡 MEDIUM

The `RobloxSignInButton` component uses a hand-drawn "R" badge approximation instead of the official Roblox logo (noted with a TODO comment in `components/auth/RobloxSignInButton.tsx`). While this avoids directly misusing Roblox's trademark, it also fails to represent the brand accurately.

More importantly, displaying any Roblox branding in the app requires compliance with [Roblox Brand Guidelines](https://corp.roblox.com/brand-guidelines/). The sign-in screen and Me screen both make functional references to Roblox accounts.

**Required action:**
1. Review the Roblox Brand Guidelines for permitted usage of their marks in third-party apps.
2. Either obtain explicit permission to use the Roblox logo/wordmark, or remove/replace the "R" badge with a neutral icon.
3. The disclaimer on the sign-in screen and Me screen ("not affiliated with, endorsed by, or sponsored by Roblox Corporation") is correct and must be retained.

---

### MP-5 · `NSPrivacyCollectedDataTypes` Is Declared Empty

**Guideline:** 5.1.1 — Privacy Manifest
**Severity:** 🟡 MEDIUM

The privacy manifest in `app.config.ts` declares `NSPrivacyCollectedDataTypes: []`, indicating no data is collected. However, the app does collect:

- Email address (optional, from Apple Sign In or direct registration)
- Roblox username and display name
- Push notification token
- Session activity (sessions created, joined, streaks)

While this data is not shared with advertisers, Apple's privacy manifest must accurately reflect collection. Apple differentiates "tracking" (cross-app data linking) from data collection, but the manifest should still enumerate what is collected.

**Required action:** Audit the privacy manifest against the actual data collected and update `NSPrivacyCollectedDataTypes` accordingly. Each entry requires a type identifier and the purpose for collection. Reference: [NSPrivacyCollectedDataTypes keys](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_data_use_in_privacy_manifests).

---

## LOW PRIORITY (Nice to Have Before Launch)

Minor issues that will not block the review but represent good practice.

---

### LP-1 · App Version Number Is the Expo Default

The `version` field in `app.config.ts` is `"1.0.0"` — the Expo project template default. While this is valid for a first release, ensure this is intentional and matches the version shown in App Store Connect. The `buildNumber` is `"11"` (with EAS autoIncrement enabled for production), which is fine.

---

### LP-2 · Google Sign-In Uses Non-Standard Button

The `GoogleSignInButton` component uses Ionicons instead of the official Google Sign-In button design. Google's [Branding Guidelines](https://developers.google.com/identity/branding-guidelines) require using their approved button. Since Google Sign-In is not available on iOS (correctly gated by `Platform.OS === 'ios'` checks), this is Android-only and does not affect the App Store review, but should be addressed for Play Store compliance.

---

### LP-3 · Competitive Feature Flag Should Be Confirmed Disabled in Production

`ENABLE_COMPETITIVE_DEPTH` is a feature flag that gates a competitive ranking system. This feature is currently disabled in production. Before submission, confirm this is disabled in the production EAS build and is not accessible to users or reviewers. If it is enabled, additional review notes should explain the competitive system to Apple reviewers.

---

## ALREADY COMPLIANT

The following requirements are correctly implemented.

| Requirement | Guideline | Status | Notes |
|---|---|---|---|
| Sign in with Apple | 4.8 | ✅ Compliant | Native button, primary on iOS, correct scopes |
| Apple private relay emails | 4.8 | ✅ Compliant | `@privaterelay.appleid.com` handled in auth flow |
| No external browser for auth | 4.0 | ✅ Compliant | ASWebAuthenticationSession via `expo-web-browser` |
| In-app account deletion | 5.1.1(v) | ✅ Compliant | Full flow in Me → Delete Account, no external site |
| Privacy Policy link | 5.1.1 | ✅ Compliant | Linked on sign-in screen and Me screen |
| Terms acceptance before sign-in | 5.1.1 | ✅ Compliant | Both checkboxes required before button enables |
| User-generated content moderation | 1.2 | ✅ Compliant | Safety report system covers CSAM, grooming, harassment |
| Block/report user mechanism | 1.2 | ✅ Compliant | In-app reporting with ticket/reference IDs |
| No in-app purchases | 3.1 | ✅ N/A | Free app, no digital goods, no monetization |
| No active tracking SDKs | 5.1.2(i) | ✅ Compliant | No Firebase/Amplitude/Mixpanel etc. |
| Privacy manifest filed | 5.1.1 | ✅ Compliant | `privacyManifests` configured in `app.config.ts` |
| Notification permission flow | 4.10 | ✅ Compliant | Permission requested, not required to use app |
| Push token unregistered on logout | 4.10 | ✅ Compliant | `PATCH /api/me/push-tokens` on sign-out |
| Custom URL scheme registered | 2.5 | ✅ Compliant | `lagalaga://` registered, `usesAppleSignIn: true` |
| Encryption declaration | — | ✅ Compliant | `ITSAppUsesNonExemptEncryption: false` |
| Roblox affiliation disclaimer | 5.2.1 | ✅ Compliant | Visible on sign-in screen and Me screen |
| 13+ age requirement stated | 2.3.6 | ✅ Compliant | Sign-in screen explicitly states "Requires a 13+ Roblox account" |

---

## Pre-Submission Checklist

Use this checklist before uploading a build to App Store Connect.

### Build
- [ ] `app/(tabs)/index.tsx` Home screen contains only real app content
- [ ] `app/(tabs)/explore.tsx` Explore screen contains only real app content (or is removed from navigation)
- [ ] `app/test-paper.tsx` has been deleted or gated to dev builds only
- [ ] Production build confirmed using Xcode 16+ / iOS 18 SDK
- [ ] `buildNumber` is incremented in `app.config.ts` / `app.json`

### App Store Connect
- [ ] DSA trader status declared
- [ ] Age rating questionnaire completed (new 2026 system, deadline Jan 31, 2026)
- [ ] Support URL set to a live, functional page
- [ ] Privacy Policy URL set and page is live
- [ ] Screenshots captured from a physical iPhone running the production build
- [ ] Screenshots show Apple Sign In button, no boilerplate, no developer tools

### Review Notes
- [ ] Review notes explain the Roblox OAuth flow (in-app session, not Safari)
- [ ] Review notes provide demo account credentials (Apple + Roblox linked account)
- [ ] Review notes explain why two login methods appear on iOS (Apple + Roblox)
- [ ] Reference `/data/apps/lagalaga/internal-docs/release/app-store-review-notes.md` for the full notes template

### Legal / Content
- [ ] Privacy policy lists Supabase and Expo notification service as data processors
- [ ] `NSPrivacyCollectedDataTypes` in `app.config.ts` reflects actual collected data
- [ ] Roblox brand asset usage reviewed against Roblox Brand Guidelines

---

## References

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Upcoming Requirements — Apple Developer](https://developer.apple.com/news/upcoming-requirements/)
- [Age Ratings Values and Definitions — App Store Connect](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)
- [NSPrivacyCollectedDataTypes — Apple Developer Documentation](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_data_use_in_privacy_manifests)
- [EU Digital Services Act — App Store Connect](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
- [Roblox Brand Guidelines](https://corp.roblox.com/brand-guidelines/)
- Related internal docs:
  - `internal-docs/release/ios-apple-store-release.md`
  - `internal-docs/release/app-store-review-notes.md`
