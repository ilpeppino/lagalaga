# Migration Plan: React Native Paper + Reanimated

## Context

LagaLaga currently uses a custom UI system with hand-crafted components using React Native StyleSheet. While functional, this approach requires maintaining custom styling for every component and doesn't provide out-of-the-box Material Design compliance or accessibility features.

**Why migrate:**
- Reduce custom styling maintenance burden (60+ TouchableOpacity instances with inline styles)
- Gain Material Design 3 compliance with consistent theming
- Improve accessibility (built-in ARIA labels, screen reader support)
- Leverage battle-tested components with cross-platform optimizations
- Enhance UX with smooth animations (ripples, transitions)
- Reanimated is already installed—no additional animation setup needed

**Why low-risk:**
- Parallel adoption strategy (new components alongside old ones)
- Screen-by-screen migration (each PR is independently shippable)
- Visual parity preserved initially
- No navigation, auth, or backend changes

---

## Current State Summary

### Tech Stack
- **Expo SDK**: ~54.0.33 (Managed workflow)
- **React Native**: 0.81.5
- **React**: 19.1.0
- **New Architecture**: ✅ ENABLED (`newArchEnabled: true`)
- **Navigation**: Expo Router ~6.0.23 (file-based routing)
- **Animation**: react-native-reanimated ~4.1.1 ✅ ALREADY INSTALLED
- **Gestures**: react-native-gesture-handler ~2.28.0 ✅ ALREADY INSTALLED

### UI System
- **No major UI library** - All custom components
- **Theming**: Custom Material Design 3-inspired system
  - 15 typography tokens (displayLarge → labelSmall)
  - Light/dark color schemes in `/constants/theme.ts`
  - Brand font: BitcountSingle (Regular/Bold)
- **Components**: 11 custom UI components (ThemedText, ThemedView, etc.)
- **Screens**: 18 route components across auth, sessions, tabs
- **Styling**: React Native StyleSheet throughout
- **Icons**: Cross-platform IconSymbol (SF Symbols on iOS, Material Icons elsewhere)

### Migration Scope
- **60+ TouchableOpacity** button instances across 8 files
- **16+ TextInput** form fields with custom styling
- **Custom animations** using Reanimated (ParallaxScrollView, HelloWave)
- **Platform-specific** date pickers, sliders, haptics

---

## Compatibility & Risk Assessment

### React Native Paper Compatibility

✅ **Confirmed Compatible:**
- **Target Version**: `react-native-paper@^5.14.5`
- Compatible with RN 0.81.5 + Expo SDK 54
- New Architecture support confirmed
- Material Design 3 (MD3) by default
- Works with Expo managed workflow

### Configuration Requirements

**Babel:**
- Add `react-native-paper/babel` plugin for production (tree-shaking)
- Ensure `react-native-reanimated/plugin` remains last
- No metro config changes needed (Expo defaults work)

### Version Risks

**LOW RISK:**
- Paper 5.x is mature and stable
- Expo 54 explicitly supports Paper
- Reanimated 4.1.1 already working
- No peer dependency conflicts

**Considerations:**
- Bundle size increase: ~400-600KB (before gzip, ~150-250KB after)
- Migration effort: 6 PRs, estimate 2-3 weeks total
- Visual parity: May require theme color adjustments

### Required Config Changes

1. **babel.config.js**: Add Paper babel plugin (tree-shaking)
2. **app/_layout.tsx**: Wrap app with PaperProvider
3. **constants/paperTheme.ts**: Create theme bridge (map existing colors/fonts to MD3)

### Expo Caveats

- ✅ No native rebuilds needed (Paper is pure JS + Expo modules)
- ✅ Works with development builds and EAS
- ✅ Compatible with Expo Router
- ⚠️ Must use `@expo/vector-icons` for icons (already installed)

---

## Migration Strategy: 6 Incremental PRs

### PR1 — Install & Configure Dependencies

**Objective:** Add React Native Paper with proper configuration, zero visual changes.

**Commands:**
```bash
npx expo install react-native-paper@^5.14.5
npx expo-doctor  # Verify no conflicts
```

**Files to Create/Modify:**

1. **Create `babel.config.js`** (if not exists):
```javascript
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        plugins: [
          'react-native-paper/babel',  // Tree-shaking
          'react-native-reanimated/plugin',  // Must be last
        ],
      },
    },
    plugins: [
      'react-native-reanimated/plugin',
    ],
  };
};
```

**Acceptance Criteria:**
- [ ] `npm ls react-native-paper` shows v5.14.5+
- [ ] App builds on iOS/Android without errors
- [ ] No runtime warnings
- [ ] Bundle size increase < 500KB (before optimization)

**Smoke Tests:**
```bash
rm -rf node_modules && npm install
npx expo start --clear
npx expo run:ios
npx expo run:android
```

**Rollback:** `npm uninstall react-native-paper && git checkout babel.config.js`

---

### PR2 — Introduce Paper Provider + Theme Scaffold

**Objective:** Wrap app with PaperProvider and bridge existing theme to Paper's MD3 system.

**Files to Create:**

1. **`/constants/paperTheme.ts`** - Theme bridge mapping existing Colors/Typography to MD3:
```typescript
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { Colors, Fonts } from './theme';

export const LightPaperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: Colors.light.tint,          // #0a7ea4
    secondary: '#007AFF',                // iOS blue
    surface: Colors.light.background,    // #fff
    onSurface: Colors.light.text,        // #11181C
    background: Colors.light.background,
    onBackground: Colors.light.text,
    error: '#c62828',
    outline: '#ddd',
    // ... (full mapping in implementation)
  },
  fonts: {
    // Map to system fonts (Fonts.sans) - full MD3 scale
  },
};

export const DarkPaperTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: Colors.dark.tint,           // #fff
    surface: Colors.dark.background,     // #151718
    onSurface: Colors.dark.text,         // #ECEDEE
    // ... (full mapping)
  },
  fonts: LightPaperTheme.fonts,
};
```

2. **Modify `/app/_layout.tsx`** - Add PaperProvider:
```typescript
import { PaperProvider } from 'react-native-paper';
import { LightPaperTheme, DarkPaperTheme } from '@/constants/paperTheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const paperTheme = colorScheme === 'dark' ? DarkPaperTheme : LightPaperTheme;

  return (
    <ErrorBoundary level="screen">
      <AuthProvider>
        <PaperProvider theme={paperTheme}>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            {/* existing Stack */}
          </ThemeProvider>
        </PaperProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
```

**Acceptance Criteria:**
- [ ] No visual changes to any screen
- [ ] `useTheme()` hook from react-native-paper works
- [ ] Theme switches correctly in light/dark mode
- [ ] No console warnings

**Smoke Tests:**
- Toggle device dark mode → theme updates
- Open all screens → no visual regressions
- Console has no Paper-related warnings

**Rollback:** Remove `<PaperProvider>` wrapper, delete `paperTheme.ts`

---

### PR3 — Create Shared UI Primitives Layer

**Objective:** Create Paper-based wrapper components without touching existing code.

**Strategy:** Parallel adoption—create NEW components in `/components/ui/paper/`, keep existing components untouched.

**Files to Create:**

1. **`/components/ui/paper/Button.tsx`**
```typescript
import { Button as PaperButton } from 'react-native-paper';

export interface ButtonProps {
  title: string;
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export function Button({ title, variant = 'filled', loading, ...rest }: ButtonProps) {
  const mode = variant === 'filled' ? 'contained' : variant;
  return <PaperButton mode={mode} loading={loading} {...rest}>{title}</PaperButton>;
}
```

2. **`/components/ui/paper/TextInput.tsx`**
```typescript
import { TextInput as PaperTextInput } from 'react-native-paper';

export interface TextInputProps extends PaperTextInputProps {
  variant?: 'outlined' | 'flat';
}

export function TextInput({ variant = 'outlined', ...rest }: TextInputProps) {
  return <PaperTextInput mode={variant} {...rest} />;
}
```

3. **`/components/ui/paper/Surface.tsx`** - Card/container wrapper
4. **`/components/ui/paper/Text.tsx`** - Typography wrapper
5. **`/components/ui/paper/Card.tsx`** - Re-export Paper Card components
6. **`/components/ui/paper/index.ts`** - Barrel exports

**Icon Strategy:** Keep existing `IconSymbol` component (already optimized for cross-platform).

**Acceptance Criteria:**
- [ ] All files pass TypeScript compilation
- [ ] Can import from `@/components/ui/paper`
- [ ] Zero impact on existing screens (not using these yet)
- [ ] Bundle increase < 100KB

**Smoke Tests:**
Create test screen (`/app/test-paper.tsx`) to verify components render correctly.

**Rollback:** `rm -rf components/ui/paper/`

---

### PR4 — Swap Low-Risk Components

**Objective:** Migrate low-traffic screens to Paper components as proof-of-concept.

**Migration Targets (Phase 1):**
1. `/app/auth/sign-in.tsx` - 1 button, minimal logic
2. `/components/ErrorFallback.tsx` - 5 buttons, isolated component

**Replacement Pattern:**

**Before:**
```tsx
<TouchableOpacity
  style={[styles.button, loading && styles.buttonDisabled]}
  onPress={handleSignIn}
  disabled={loading}
>
  {loading ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <ThemedText type="titleMedium" lightColor="#fff">
      Sign in with Roblox
    </ThemedText>
  )}
</TouchableOpacity>
```

**After:**
```tsx
import { Button } from '@/components/ui/paper';

<Button
  title="Sign in with Roblox"
  variant="filled"
  onPress={handleSignIn}
  loading={loading}
  style={styles.button}
/>
```

**Changes:**
- Replace TouchableOpacity → Button
- Remove manual loading/disabled state styling
- Clean up unused StyleSheet entries (buttonDisabled, buttonText)

**Acceptance Criteria:**
- [ ] Auth screen looks identical (or better)
- [ ] Button press ripple works (Android) / opacity fade (iOS)
- [ ] Loading state displays correctly
- [ ] Accessibility improved (screen reader announces "button")
- [ ] Bundle increase < 50KB

**Smoke Tests:**
- Visual: Screenshot comparison light/dark mode
- Functional: Complete sign-in flow end-to-end
- Accessibility: VoiceOver announces "Sign in with Roblox, button"

**Rollback:** `git checkout app/auth/sign-in.tsx components/ErrorFallback.tsx`

---

### PR5 — Introduce Reanimated Micro-interactions

**Objective:** Add subtle animations to Paper components using already-installed Reanimated.

**Why:** Reanimated 4.1.1 is already configured—leverage it for enhanced UX.

**Approach:** Conservative—rely on Paper's built-in animations first.

**Paper Built-in Animations:**
- Button ripple (Android native)
- Button opacity fade (iOS)
- TextInput underline animation
- Surface elevation transitions

**Optional Enhancements:**
- Button press scale animation using Reanimated
- Layout animations for appearing/disappearing components
- Custom timing curves via `theme.animation`

**Files to Modify:**

1. **`/constants/paperTheme.ts`** - Add animation config:
```typescript
export const LightPaperTheme = {
  // ... existing
  animation: {
    scale: 1.0,
    defaultAnimationDuration: 200,
  },
};
```

2. **(Optional) `/components/ui/paper/AnimatedButton.tsx`** - Enhanced press animation:
```typescript
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';

export function AnimatedButton(props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Button {...props} />
    </Animated.View>
  );
}
```

**Acceptance Criteria:**
- [ ] Animations feel responsive (< 200ms)
- [ ] 60 FPS maintained during animations
- [ ] Respects `prefers-reduced-motion` accessibility setting
- [ ] No performance regression

**Smoke Tests:**
- Open React Native Perf Monitor (CMD+D → "Show Perf Monitor")
- Tap buttons rapidly → FPS stays above 55
- Enable "Reduce Motion" → animations simplify or disable

**Rollback:** Remove AnimatedButton, revert theme config—Paper defaults remain.

---

### PR6 — Gradual Full Migration & Old UI Removal

**Objective:** Complete migration of remaining screens, deprecate old patterns.

**Remaining Screens (Phase 2-3):**
- `/app/sessions/create-v2.tsx` - 11 TouchableOpacity, 4 TextInput
- `/app/sessions/[id]-v2.tsx` - 9 TouchableOpacity
- `/app/sessions/index-v2.tsx` - 5 TouchableOpacity
- `/app/invite/[code].tsx` - 13 TouchableOpacity
- `/components/ui/collapsible.tsx` - 3 TouchableOpacity

**Component Replacement Matrix:**

| Old Pattern | New Component | Migration Notes |
|-------------|---------------|-----------------|
| `<TouchableOpacity onPress={...}>` + text | `<Button variant="filled">` | Add `title` prop |
| `<TouchableOpacity>` (outlined style) | `<Button variant="outlined">` | Remove border styles |
| `<TextInput style={...}>` | `<TextInput variant="outlined">` | Remove border/color styles |
| `<View style={cardStyle}>` | `<Card><CardContent>` | Automatic elevation |
| `<ThemedView>` (with elevation) | `<Surface elevation={2}>` | Use elevation prop |

**Session Creation Form Migration:**
- 4x TextInput → Paper TextInput (URL, title, description)
- 3x visibility buttons → SegmentedButtons
- Submit button → Button (filled variant)
- Date picker button → Button (outlined variant)
- Keep `@react-native-community/slider` (no Paper equivalent)

**Session Detail Migration:**
- Action buttons → Button components
- Participant list → Card components
- Status badges → Chip components

**Session Index Migration:**
- "Create Session" button → FAB (FloatingActionButton)
- Session cards → Card components
- Pull-to-refresh → Paper ActivityIndicator

**Components to Keep:**
- ✅ `ThemedText` - Still useful for brand font typography
- ✅ `ThemedView` - Lightweight, no harm
- ✅ `IconSymbol` - Platform-specific icon strategy
- ❌ Remove inline TouchableOpacity button patterns
- ❌ Remove custom TextInput styling patterns

**Acceptance Criteria:**
- [ ] All 18 screens migrated to Paper
- [ ] 90%+ reduction in custom button/input styles
- [ ] Visual parity or improvement vs. before
- [ ] Bundle size increase < 200KB (this PR only)
- [ ] No accessibility regressions

**Smoke Tests:**

**Visual Regression:**
- Screenshot comparison: before/after each screen
- Light/dark mode both look polished
- Tablet/landscape layouts adapt correctly

**Functional:**
- Complete user flow: sign in → create session → join → leave
- All buttons respond, all inputs accept text
- Forms validate correctly, error states display

**Performance:**
- App launch time unchanged
- Screen transitions smooth
- Bundle size analysis: `npx expo export --platform ios`

**Accessibility:**
- VoiceOver/TalkBack: navigate through all screens
- Keyboard navigation (web): logical tab order
- High contrast mode: text readable

**Rollback:**
- Gradual: Revert one screen at a time if issues found
- Full: `git revert <commit-hash> && npx expo start --clear`
- Feature flag (if needed): Toggle Paper vs old components per screen

---

## Verification Plan

### Per-PR Verification

**PR1-2:** Smoke tests only (no behavior changes)

**PR3:** Component unit tests (optional—use @testing-library/react-native)

**PR4-6:**
- Manual QA for each migrated screen
- E2E tests for critical flows (optional—Detox or Maestro)
- Visual regression testing (screenshot comparison)

### Bundle Size Tracking

After each PR, measure bundle size:

```bash
npx expo export --platform ios --output-dir dist/ios
du -sh dist/ios

npx expo export --platform android --output-dir dist/android
du -sh dist/android
```

**Target Limits:**
- PR1: +300-400KB (Paper library)
- PR2: +10KB (theme config)
- PR3: +50KB (wrapper components)
- PR4: +20KB (first migrations)
- PR5: +0KB (Reanimated already installed)
- PR6: +100KB (remaining components)
- **Total: ~500-600KB pre-gzip, ~150-250KB post-gzip**

### Accessibility Audit

Before and after full migration:
- [ ] VoiceOver (iOS): Navigate each screen, verify announcements
- [ ] TalkBack (Android): Navigate each screen, verify announcements
- [ ] Keyboard navigation (web): Tab order logical
- [ ] High contrast mode: All text readable
- [ ] Font scaling: Test at 200% font size
- [ ] Reduced motion: Animations simplify or disable

---

## Critical Files

### Must Modify (PR Order):
1. `package.json` - Install react-native-paper
2. `babel.config.js` - Add Paper babel plugin
3. `constants/paperTheme.ts` - NEW: Theme bridge
4. `app/_layout.tsx` - Wrap with PaperProvider
5. `components/ui/paper/*.tsx` - NEW: Wrapper components
6. `app/auth/sign-in.tsx` - First migration target
7. `app/sessions/create-v2.tsx` - Form migration
8. `app/sessions/[id]-v2.tsx` - Detail view migration
9. `app/sessions/index-v2.tsx` - List view migration
10. `app/invite/[code].tsx` - Invite flow migration

### Must NOT Modify:
- Navigation structure (`app/_layout.tsx` except PaperProvider)
- Auth flows (`AuthProvider`)
- Backend integration (`src/lib/api.ts`)
- Existing animations (`components/parallax-scroll-view.tsx` - keep as-is)

---

## Risk Mitigation

### High-Risk Areas

**1. Form Inputs** - Behavioral differences
- **Mitigation:** Test keyboard behaviors (dismiss, return key, autocorrect)
- **Mitigation:** Compare input measurements (padding, font size)
- **Mitigation:** Verify platform-specific date picker still works

**2. Button Press States** - Different feedback per platform
- **Mitigation:** Test on real devices, not just simulators
- **Mitigation:** Keep TouchableOpacity option for custom press handlers

**3. Dark Mode** - Color mapping imperfections
- **Mitigation:** Side-by-side screenshot comparison
- **Mitigation:** Allow color overrides via `buttonColor` props

**4. Accessibility** - Screen reader announcement changes
- **Mitigation:** Full VoiceOver/TalkBack audit before/after
- **Mitigation:** Add `accessibilityLabel` where needed

### Compatibility Guarantees

**WILL NOT BREAK:**
- ✅ Expo Router navigation
- ✅ Auth flows (AuthProvider, Supabase)
- ✅ Backend API calls
- ✅ Deep linking
- ✅ Reanimated animations (already working)
- ✅ Platform-specific features (haptics, clipboard, etc.)

**MAY REQUIRE ADJUSTMENT:**
- Custom button colors → use `buttonColor` prop
- Custom input styling → use Paper's theme override
- TouchableOpacity with custom children → keep as-is or refactor

---

## Post-Migration Cleanup (Future)

After all PRs stable for 1-2 weeks:

1. **Consolidate theme files:**
   - Move all theme logic to `paperTheme.ts`
   - Remove `constants/theme.ts` (colors/fonts) if no longer needed
   - Keep `constants/typography.ts` only if using brand fonts

2. **Remove deprecated patterns:**
   - Global find/replace remaining TouchableOpacity (if any)
   - Remove unused StyleSheet styles
   - Clean up color constants

3. **Optimize bundle (optional):**
   - Audit with bundle analyzer
   - Remove any unused Paper components
   - Consider lazy-loading heavy components

4. **Add Storybook (optional):**
   - Document all Paper components
   - Interactive playground for designers
   - Generate screenshot tests

---

## Summary

**Migration Type:** Incremental, parallel adoption (low-risk)

**Timeline:** 6 PRs, estimated 2-3 weeks total (depends on team capacity)

**Effort:** Medium—most work is mechanical replacement, not architectural

**Risk Level:** LOW—each PR is independently shippable and reversible

**Bundle Impact:** +500-600KB pre-gzip (~150-250KB post-gzip)—acceptable for enterprise app

**Key Win:** Reanimated already installed means animation setup is free

**Compatibility:** ✅ Confirmed compatible with Expo 54, RN 0.81.5, New Architecture

**Visual Impact:** Zero initially (theme bridge maintains visual parity), polish comes later

**Next Steps:** Execute PR1 (install + configure) when ready to proceed.
