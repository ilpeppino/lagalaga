import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
  Platform,
  Animated,
  Easing,
  Switch,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { apiClient } from '@/src/lib/api';
import { ENABLE_COMPETITIVE_DEPTH } from '@/src/lib/runtimeConfig';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useAuth } from '@/src/features/auth/useAuth';
import { refreshFavorites } from '@/src/features/favorites/service';
import { refreshFriends } from '@/src/features/friends/service';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '@/src/lib/oauthTransientStorage';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { ActivityIndicator } from 'react-native-paper';
import { openRobloxAuthSession } from '@/src/features/auth/robloxAuthSession';
import { resolveAccountLinkConflict } from '@/src/features/auth/accountLinkConflict';
import { logger } from '@/src/lib/logger';
import { getOrCreateAuthFlowCorrelationId } from '@/src/features/auth/authFlowCorrelation';
import {
  DEFAULT_SESSION_SETTINGS,
  type SessionSettings,
  loadSessionSettings,
  saveSessionSettings,
} from '@/src/lib/sessionSettings';
import {
  PROFILE_NAME_MAX_WIDTH,
  PROFILE_NAME_MINIMUM_FONT_SCALE,
  resolveConnectorDotColor,
  resolveHaloColor,
  resolvePrimaryProfileName,
  resolveSyncA11yLabel,
  resolveSyncIconName,
} from '@/src/lib/meHelpers';

const PRIVACY_POLICY_URL = 'https://ilpeppino.github.io/lagalaga/privacy-policy.html';
const TERMS_OF_SERVICE_URL = 'https://ilpeppino.github.io/lagalaga/terms.html';

interface MeData {
  appUser: {
    id: string;
    email: string | null;
    displayName: string;
  };
  roblox: {
    connected: boolean;
    robloxUserId: string | null;
    username: string | null;
    displayName: string | null;
    avatarHeadshotUrl: string | null;
    verifiedAt: string | null;
  };
  competitive?: {
    rating: number;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';
    currentSeasonNumber: number | null;
    seasonEndsAt: string | null;
    badges: {
      seasonNumber: number;
      finalRating: number;
      tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';
    }[];
  };
}

interface MeResponse {
  success: boolean;
  data: MeData;
  requestId: string;
}

// ---------------------------------------------------------------------------
// NumberSettingRow — inline stepper control used in the Settings card
// ---------------------------------------------------------------------------
function NumberSettingRow({
  label,
  value,
  onChange,
  textColor,
  tintColor,
}: {
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
  textColor: string;
  tintColor: string;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(48, v));
  return (
    <View style={stepperStyles.row}>
      <Text style={[stepperStyles.label, { color: textColor }]}>{label}</Text>
      <View style={stepperStyles.controls}>
        <TouchableOpacity
          onPress={() => onChange(clamp(value - 1))}
          style={[stepperStyles.btn, { backgroundColor: tintColor }]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={stepperStyles.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={[stepperStyles.value, { color: textColor }]}>{value}h</Text>
        <TouchableOpacity
          onPress={() => onChange(clamp(value + 1))}
          style={[stepperStyles.btn, { backgroundColor: tintColor }]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={stepperStyles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: { gap: 6 },
  label: { fontSize: 14 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 20 },
  value: { minWidth: 36, textAlign: 'center', fontSize: 14, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// ConnectorDots — three dots bridging avatar ↔ Roblox in the header row
// ---------------------------------------------------------------------------
function ConnectorDots({ active, error }: { active: boolean; error: boolean }) {
  const color = resolveConnectorDotColor({ syncing: active, syncError: error });
  return (
    <View style={connectorDotStyles.row}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[connectorDotStyles.dot, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const connectorDotStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

// ---------------------------------------------------------------------------
// MeScreen
// ---------------------------------------------------------------------------
export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const { user, signInWithApple, signOut } = useAuth();
  const { colorScheme, themePreference, setThemePreference } = useAppTheme();

  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [proViewEnabled, setProViewEnabled] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [linkingApple, setLinkingApple] = useState(false);

  // Session settings (embedded from /settings)
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SESSION_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [syncFeedback, setSyncFeedback] = useState<'idle' | 'success' | 'error'>('idle');
  const [signingOut, setSigningOut] = useState(false);
  const syncFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Animations
  // ---------------------------------------------------------------------------
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const haloScaleAnim = useRef(new Animated.Value(1)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const connectorPulseAnim = useRef(new Animated.Value(0.7)).current;
  const connectorPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const syncFeedbackScaleAnim = useRef(new Animated.Value(1)).current;

  // Rotate sync icon while refreshing
  useEffect(() => {
    if (refreshing) {
      spinAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinLoopRef.current = loop;
      loop.start();
    } else {
      spinLoopRef.current?.stop();
      spinLoopRef.current = null;
      spinAnim.setValue(0);
    }
  }, [refreshing, spinAnim]);

  // Subtle connector pulse while syncing
  useEffect(() => {
    if (refreshing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(connectorPulseAnim, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(connectorPulseAnim, {
            toValue: 0.55,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      connectorPulseLoopRef.current = loop;
      loop.start();
    } else {
      connectorPulseLoopRef.current?.stop();
      connectorPulseLoopRef.current = null;
      connectorPulseAnim.setValue(0.7);
    }
  }, [connectorPulseAnim, refreshing]);

  // Fade in content after initial load
  useEffect(() => {
    if (!loading && data) {
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [loading, data, contentFadeAnim]);

  // Briefly pulse the avatar halo on successful sync
  const pulseHalo = useCallback(() => {
    Animated.sequence([
      Animated.timing(haloScaleAnim, { toValue: 1.1, duration: 180, useNativeDriver: true }),
      Animated.timing(haloScaleAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [haloScaleAnim]);

  const pulseSyncFeedback = useCallback(() => {
    Animated.sequence([
      Animated.timing(syncFeedbackScaleAnim, { toValue: 1.14, duration: 140, useNativeDriver: true }),
      Animated.timing(syncFeedbackScaleAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [syncFeedbackScaleAnim]);

  const queueSyncFeedbackReset = useCallback((nextFeedback: 'success' | 'error', durationMs: number) => {
    setSyncFeedback(nextFeedback);
    if (syncFeedbackTimerRef.current) {
      clearTimeout(syncFeedbackTimerRef.current);
    }
    syncFeedbackTimerRef.current = setTimeout(() => {
      setSyncFeedback('idle');
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      spinLoopRef.current?.stop();
      connectorPulseLoopRef.current?.stop();
      if (syncFeedbackTimerRef.current) {
        clearTimeout(syncFeedbackTimerRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const fetchMeData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.getRaw('/api/me');
      if (!response.ok) throw new Error('Failed to fetch user data');
      const json: MeResponse = await response.json();
      setData(json.data);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const loadSettings = useCallback(async () => {
    try {
      setSettingsLoading(true);
      const loaded = await loadSessionSettings();
      setSettings(loaded);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to load settings' });
    } finally {
      setSettingsLoading(false);
    }
  }, [handleError]);

  useFocusEffect(
    useCallback(() => {
      void fetchMeData();
      void loadSettings();
    }, [fetchMeData, loadSettings])
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleSyncRobloxData = async () => {
    if (!user?.id) {
      handleError(new Error('User session not available'), {
        fallbackMessage: 'Failed to sync Roblox data',
      });
      return;
    }

    try {
      setSyncFeedback('idle');
      setRefreshing(true);
      const failedActions: string[] = [];

      try {
        await refreshFriends(user.id, { force: true });
      } catch {
        failedActions.push('friends');
      }

      try {
        await refreshFavorites(user.id, { force: true });
      } catch {
        failedActions.push('favorites');
      }

      const response = await apiClient.getRaw('/api/me');
      if (!response.ok) throw new Error('Failed to refresh profile');
      const json: MeResponse = await response.json();
      setData(json.data);

      if (failedActions.length > 0) {
        pulseSyncFeedback();
        queueSyncFeedbackReset('error', 1300);
        Alert.alert(
          'Sync completed with issues',
          `Couldn't refresh: ${failedActions.join(', ')}.`
        );
      } else {
        pulseHalo();
        pulseSyncFeedback();
        queueSyncFeedbackReset('success', 900);
      }
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to sync Roblox data' });
      pulseSyncFeedback();
      queueSyncFeedbackReset('error', 1700);
    } finally {
      setRefreshing(false);
    }
  };

  const handleConnectRoblox = async () => {
    try {
      const flowCorrelationId = await getOrCreateAuthFlowCorrelationId();
      const { authorizationUrl, state } = await sessionsAPIStoreV2.getRobloxConnectUrl();
      await oauthTransientStorage.setItem(OAUTH_STORAGE_KEYS.ROBLOX_CONNECT_STATE, state);
      const authResult = await openRobloxAuthSession(authorizationUrl);
      logger.info('Roblox connect auth session returned from Me screen', {
        flowCorrelationId,
        resultType: authResult.type,
      });

      if (authResult.type === 'success' && 'url' in authResult) {
        try {
          const callbackUrl = new URL(authResult.url);
          const callbackCode = callbackUrl.searchParams.get('code');
          const callbackState = callbackUrl.searchParams.get('state');
          logger.info('Parsed Roblox callback URL from Me screen auth session result', {
            flowCorrelationId,
            hasCode: Boolean(callbackCode),
            hasState: Boolean(callbackState),
          });

          if (callbackCode && callbackState) {
            router.replace({
              pathname: '/auth/roblox',
              params: { code: callbackCode, state: callbackState },
            });
          }
        } catch {
          logger.warn('Failed to parse Roblox callback URL from Me screen auth session result', {
            flowCorrelationId,
          });
        }
      }
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to start Roblox connect flow.' });
    }
  };

  const handleLinkApple = async () => {
    try {
      setLinkingApple(true);
      await signInWithApple();
      Alert.alert('Apple linked', 'You can now continue with Apple or Roblox on sign in.');
    } catch (error) {
      const conflictResolution = resolveAccountLinkConflict(error, 'apple');
      if (conflictResolution.handled) {
        Alert.alert(conflictResolution.title, conflictResolution.message);
        return;
      }
      handleError(error, { fallbackMessage: 'Failed to link Apple account.' });
    } finally {
      setLinkingApple(false);
    }
  };

  const updateSetting = useCallback(
    async (nextPartial: Partial<SessionSettings>) => {
      try {
        const next = await saveSessionSettings(nextPartial);
        setSettings(next);
      } catch (error) {
        handleError(error, { fallbackMessage: 'Failed to save settings' });
      }
    },
    [handleError]
  );

  const formatCountdown = (endDate: string | null): string => {
    if (!endDate) return 'N/A';
    const diffMs = new Date(endDate).getTime() - Date.now();
    if (diffMs <= 0) return 'Ending soon';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    return `${days}d ${hours}h`;
  };

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out of Lagalaga?',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              await signOut();
            } catch {
              // signOut handles cleanup in finally block.
            } finally {
              setSigningOut(false);
              router.replace('/auth/sign-in');
            }
          },
        },
      ],
    );
  }, [router, signOut]);

  useEffect(() => {
    if (signingOut && !user) {
      router.replace('/auth/sign-in');
    }
  }, [router, signingOut, user]);

  // ---------------------------------------------------------------------------
  // Derived colors
  // ---------------------------------------------------------------------------
  const isDark = colorScheme === 'dark';
  const backgroundColor = Colors[colorScheme].background;
  const textColor = Colors[colorScheme].text;
  const cardColor = isDark ? '#1c1c1e' : '#f2f2f7';
  const tintColor = Colors[colorScheme].tint;
  const rowBorderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)';
  const secondaryTextColor = isDark ? '#b3b3b8' : '#5f6368';
  const segmentBg = isDark ? '#2c2c2e' : '#e5e5ea';
  const segmentActiveBg = isDark ? '#3a3a3c' : '#ffffff';

  const syncError = syncFeedback === 'error';
  const haloColor = resolveHaloColor({ connected: data?.roblox.connected ?? false, syncing: refreshing, syncError });
  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  const BackButton = () => (
    <TouchableOpacity
      style={[
        styles.backButton,
        {
          top: insets.top + 8,
          backgroundColor: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.07)',
        },
      ]}
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      accessibilityHint="Returns to the previous screen"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <IconSymbol
        name="chevron.left"
        size={22}
        color={isDark ? '#ffffff' : '#1c1c1e'}
      />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <BackButton />
        <View style={styles.centered}>
          <LagaLoadingSpinner size={56} label="Loading profile..." />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <BackButton />
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: textColor }]}>Failed to load profile</Text>
        </View>
      </View>
    );
  }

  const primaryName = resolvePrimaryProfileName({
    robloxDisplayName: data.roblox.displayName,
    robloxUsername: data.roblox.username,
    appDisplayName: data.appUser.displayName,
  });

  const showAccountSection =
    (Platform.OS === 'ios' && data.roblox.connected) ||
    !!data.appUser.email ||
    !!(data.roblox.connected && (data.roblox.robloxUserId || data.roblox.verifiedAt));

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Floating back arrow — sits above the scroll view */}
      <BackButton />

      <Animated.ScrollView
        style={{ opacity: contentFadeAnim }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Profile header                                                       */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.profileHeader}>
          {/* Row: large avatar | sync icon | roblox indicator */}
          <View style={styles.avatarRow}>
            {/* Avatar with animated halo ring */}
            <Animated.View
              style={[styles.avatarHaloWrap, { transform: [{ scale: haloScaleAnim }] }]}
            >
              <View
                style={[
                  styles.haloRing,
                  {
                    borderColor: haloColor,
                    shadowColor: haloColor,
                  },
                ]}
              >
                <View style={[styles.avatarCircle, { backgroundColor: cardColor }]}>
                  {data.roblox.connected && data.roblox.avatarHeadshotUrl ? (
                    <Image
                      source={{ uri: data.roblox.avatarHeadshotUrl }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <IconSymbol name="person.fill" size={48} color={tintColor} />
                  )}
                </View>
              </View>
            </Animated.View>

            {/* Connector: dots — sync icon — dots */}
            <View style={styles.connectorBridge}>
              <Animated.View style={[styles.connectorSide, { opacity: connectorPulseAnim }]}>
                <ConnectorDots active={refreshing} error={syncError} />
              </Animated.View>
              {data.roblox.connected ? (
                <TouchableOpacity
                  onPress={() => void handleSyncRobloxData()}
                  disabled={refreshing}
                  style={styles.syncIconWrap}
                  accessibilityRole="button"
                  accessibilityLabel={resolveSyncA11yLabel({
                    connected: data.roblox.connected,
                    syncing: refreshing,
                    feedback: syncFeedback,
                  })}
                  accessibilityState={{ disabled: refreshing, busy: refreshing }}
                >
                  <Animated.View
                    style={{
                      transform: [{ rotate: spin }, { scale: syncFeedbackScaleAnim }],
                    }}
                  >
                    <IconSymbol
                      name={resolveSyncIconName({ syncing: refreshing, feedback: syncFeedback })}
                      size={22}
                      color={
                        refreshing
                          ? tintColor
                          : syncFeedback === 'success'
                            ? '#34c759'
                            : syncError
                              ? '#ff3b30'
                              : secondaryTextColor
                      }
                    />
                  </Animated.View>
                </TouchableOpacity>
              ) : (
                <View style={styles.syncIconWrap} accessibilityLabel="Roblox not connected">
                  <IconSymbol name="minus.circle" size={22} color={secondaryTextColor} />
                </View>
              )}
              <Animated.View style={[styles.connectorSide, { opacity: connectorPulseAnim }]}>
                <ConnectorDots active={refreshing} error={syncError} />
              </Animated.View>
            </View>

            {/* Roblox identity mark */}
            <View style={styles.robloxMarkWrap}>
              {data.roblox.connected ? (
                <>
                  <View style={styles.robloxBadge} accessibilityLabel="Roblox account connected">
                    <Text style={styles.robloxBadgeR}>R</Text>
                  </View>
                  <Text style={[styles.robloxBadgeLabel, { color: secondaryTextColor }]}>
                    Roblox
                  </Text>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => void handleConnectRoblox()}
                  style={[styles.connectPill, { borderColor: tintColor }]}
                  accessibilityRole="button"
                  accessibilityLabel="Connect your Roblox account"
                >
                  <Text style={[styles.connectPillText, { color: tintColor }]}>Connect</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Username */}
          <View style={styles.avatarIdentityMeta}>
            <Text
              style={[styles.profileName, { color: textColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={PROFILE_NAME_MINIMUM_FONT_SCALE}
            >
              {primaryName}
            </Text>
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Settings card                                                        */}
        {/* ------------------------------------------------------------------ */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          {/* Theme selector */}
          <Text style={[styles.sectionLabel, { color: secondaryTextColor }]}>THEME</Text>
          <View style={[styles.segmentedControl, { backgroundColor: segmentBg }]}>
            {(['system', 'light', 'dark'] as const).map((pref) => (
              <TouchableOpacity
                key={pref}
                onPress={() => void setThemePreference(pref)}
                style={[
                  styles.segment,
                  themePreference === pref && [
                    styles.segmentActive,
                    { backgroundColor: segmentActiveBg },
                  ],
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: themePreference === pref }}
                accessibilityLabel={`${pref} theme`}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color:
                        themePreference === pref ? tintColor : secondaryTextColor,
                    },
                  ]}
                >
                  {pref.charAt(0).toUpperCase() + pref.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Sessions settings */}
          <View style={[styles.divider, { backgroundColor: rowBorderColor }]} />
          <Text style={[styles.sectionLabel, { color: secondaryTextColor }]}>SESSIONS</Text>

          {settingsLoading ? (
            <ActivityIndicator
              size="small"
              color={tintColor}
              style={{ marginVertical: 8 }}
            />
          ) : (
            <View style={styles.settingsRows}>
              <NumberSettingRow
                label="Auto-complete live sessions after"
                value={settings.autoCompleteLiveAfterHours}
                onChange={(v) => {
                  setSettings((prev) => ({ ...prev, autoCompleteLiveAfterHours: v }));
                  void updateSetting({ autoCompleteLiveAfterHours: v });
                }}
                textColor={textColor}
                tintColor={tintColor}
              />
              <NumberSettingRow
                label="Auto-hide completed sessions after"
                value={settings.autoHideCompletedAfterHours}
                onChange={(v) => {
                  setSettings((prev) => ({ ...prev, autoHideCompletedAfterHours: v }));
                  void updateSetting({ autoHideCompletedAfterHours: v });
                }}
                textColor={textColor}
                tintColor={tintColor}
              />
              <NumberSettingRow
                label="Starting soon window"
                value={settings.startingSoonWindowHours}
                onChange={(v) => {
                  setSettings((prev) => ({ ...prev, startingSoonWindowHours: v }));
                  void updateSetting({ startingSoonWindowHours: v });
                }}
                textColor={textColor}
                tintColor={tintColor}
              />
            </View>
          )}

          {/* Account subsection */}
          {showAccountSection ? (
            <>
              <View style={[styles.divider, { backgroundColor: rowBorderColor }]} />
              <Text style={[styles.sectionLabel, { color: secondaryTextColor }]}>ACCOUNT</Text>

              {data.appUser.email ? (
                <View
                  style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}
                >
                  <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>Email</Text>
                  <Text style={[styles.infoRowValue, { color: textColor }]}>
                    {data.appUser.email}
                  </Text>
                </View>
              ) : null}

              {Platform.OS === 'ios' && data.roblox.connected ? (
                <TouchableOpacity
                  style={[styles.listRowButton, { borderBottomColor: rowBorderColor }]}
                  onPress={() => void handleLinkApple()}
                  disabled={linkingApple}
                  accessibilityRole="button"
                  accessibilityLabel="Link Apple Account"
                >
                  <IconSymbol name="apple.logo" size={18} color={textColor} />
                  <Text style={[styles.listRowButtonText, { color: textColor }]}>
                    {linkingApple ? 'Linking…' : 'Link Apple Account'}
                  </Text>
                  {linkingApple ? (
                    <ActivityIndicator size="small" color={secondaryTextColor} />
                  ) : (
                    <IconSymbol name="chevron.right" size={14} color={secondaryTextColor} />
                  )}
                </TouchableOpacity>
              ) : null}

              {/* Advanced Roblox details (collapsible) */}
              {data.roblox.connected &&
              (data.roblox.robloxUserId || data.roblox.verifiedAt) ? (
                <>
                  <TouchableOpacity
                    style={[styles.listRowButton, { borderBottomColor: rowBorderColor }]}
                    onPress={() => setAdvancedExpanded((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle Roblox account details"
                  >
                    <IconSymbol
                      name="info.circle"
                      size={18}
                      color={secondaryTextColor}
                    />
                    <Text style={[styles.listRowButtonText, { color: textColor }]}>
                      Roblox details
                    </Text>
                    <View
                      style={{
                        transform: [{ rotate: advancedExpanded ? '180deg' : '0deg' }],
                      }}
                    >
                      <IconSymbol name="chevron.down" size={14} color={secondaryTextColor} />
                    </View>
                  </TouchableOpacity>

                  {advancedExpanded ? (
                    <View style={styles.advancedSection}>
                      {data.roblox.robloxUserId ? (
                        <View style={styles.advancedRow}>
                          <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>
                            Roblox ID
                          </Text>
                          <Text style={[styles.infoRowValue, { color: textColor }]}>
                            {data.roblox.robloxUserId}
                          </Text>
                        </View>
                      ) : null}
                      {data.roblox.verifiedAt ? (
                        <View style={styles.advancedRow}>
                          <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>
                            Connected
                          </Text>
                          <Text style={[styles.infoRowValue, { color: textColor }]}>
                            {new Date(data.roblox.verifiedAt).toLocaleDateString()}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Competitive profile card (optional feature flag)                    */}
        {/* ------------------------------------------------------------------ */}
        {ENABLE_COMPETITIVE_DEPTH && data.competitive ? (
          <View style={[styles.card, { backgroundColor: cardColor }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: textColor }]}>Competitive</Text>
              <View style={styles.proViewRow}>
                <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>
                  Pro View
                </Text>
                <Switch
                  value={proViewEnabled}
                  onValueChange={setProViewEnabled}
                  trackColor={{ false: '#767577', true: tintColor }}
                />
              </View>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>Tier</Text>
              <Text style={[styles.infoRowValue, { color: textColor }]}>
                {data.competitive.tier.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>Rating</Text>
              <Text style={[styles.infoRowValue, { color: textColor }]}>
                {data.competitive.rating}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>Season</Text>
              <Text style={[styles.infoRowValue, { color: textColor }]}>
                {data.competitive.currentSeasonNumber
                  ? `S${data.competitive.currentSeasonNumber}`
                  : 'N/A'}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>Ends in</Text>
              <Text style={[styles.infoRowValue, { color: textColor }]}>
                {formatCountdown(data.competitive.seasonEndsAt)}
              </Text>
            </View>

            {proViewEnabled && data.competitive.badges.length > 0 ? (
              <View style={styles.badgesBlock}>
                <Text style={[styles.infoRowLabel, { color: secondaryTextColor }]}>
                  Season Badges
                </Text>
                {data.competitive.badges.map((badge) => (
                  <Text
                    key={`${badge.seasonNumber}-${badge.finalRating}`}
                    style={[styles.badgeItem, { color: textColor }]}
                  >
                    {`S${badge.seasonNumber}: ${badge.tier.toUpperCase()} (${badge.finalRating})`}
                  </Text>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.actionRowButton, { borderColor: rowBorderColor }]}
              onPress={() => router.push('/match-history')}
              accessibilityRole="button"
            >
              <IconSymbol name="list.bullet.rectangle" size={18} color={tintColor} />
              <Text style={[styles.listRowButtonText, { color: tintColor }]}>
                View Match History
              </Text>
              <IconSymbol name="chevron.right" size={14} color={secondaryTextColor} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* More card — legal, safety, destructive actions                       */}
        {/* ------------------------------------------------------------------ */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <TouchableOpacity
            style={[styles.listRowButton, { borderBottomColor: rowBorderColor }]}
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Open Privacy Policy"
          >
            <IconSymbol name="doc.text" size={18} color={secondaryTextColor} />
            <Text style={[styles.listRowButtonText, { color: textColor }]}>Privacy Policy</Text>
            <IconSymbol name="chevron.right" size={14} color={secondaryTextColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listRowButton, { borderBottomColor: rowBorderColor }]}
            onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)}
            accessibilityRole="link"
            accessibilityLabel="Open Terms of Service"
          >
            <IconSymbol name="doc.plaintext" size={18} color={secondaryTextColor} />
            <Text style={[styles.listRowButtonText, { color: textColor }]}>Terms of Service</Text>
            <IconSymbol name="chevron.right" size={14} color={secondaryTextColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listRowButton, { borderBottomColor: rowBorderColor }]}
            onPress={() => router.push('/safety-report')}
            accessibilityRole="button"
            accessibilityLabel="Open Safety and Report"
          >
            <IconSymbol name="exclamationmark.shield" size={18} color={secondaryTextColor} />
            <Text style={[styles.listRowButtonText, { color: textColor }]}>Safety & Report</Text>
            <IconSymbol name="chevron.right" size={14} color={secondaryTextColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listRowButton, { borderBottomColor: rowBorderColor }]}
            onPress={handleSignOut}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            {signingOut ? (
              <ActivityIndicator size={18} color={secondaryTextColor} />
            ) : (
              <IconSymbol name="rectangle.portrait.and.arrow.right" size={18} color={secondaryTextColor} />
            )}
            <Text style={[styles.listRowButtonText, { color: textColor }]}>Sign Out</Text>
            <IconSymbol name="chevron.right" size={14} color={secondaryTextColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listRowButton, { borderBottomColor: rowBorderColor }]}
            onPress={() => router.push('/account/delete')}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <IconSymbol name="trash" size={18} color="#c62828" />
            <Text style={[styles.listRowButtonText, { color: '#c62828' }]}>Delete Account</Text>
            <IconSymbol name="chevron.right" size={14} color="#c62828" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.disclaimer, { color: secondaryTextColor }]}>
          Lagalaga is not affiliated with, endorsed by, or sponsored by Roblox Corporation.
        </Text>
      </Animated.ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  // Profile header
  profileHeader: {
    alignItems: 'stretch',
    paddingVertical: 12,
    marginBottom: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  avatarHaloWrap: {
    alignItems: 'center',
    width: 112,
  },
  haloRing: {
    borderRadius: 999,
    borderWidth: 3,
    padding: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  connectorBridge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    marginHorizontal: 10,
  },
  connectorSide: {
    flex: 1,
    alignItems: 'center',
  },
  syncIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(127,127,127,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  robloxMarkWrap: {
    alignItems: 'center',
    gap: 4,
    width: 72,
    paddingTop: 28,
  },
  avatarIdentityMeta: {
    width: PROFILE_NAME_MAX_WIDTH,
    maxWidth: PROFILE_NAME_MAX_WIDTH,
    alignItems: 'center',
  },
  robloxBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e8272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  robloxBadgeR: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  robloxBadgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  connectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  connectPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    width: '100%',
  },
  // Cards
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  // Segmented control (theme)
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -16,
  },
  settingsRows: {
    gap: 12,
  },
  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoRowLabel: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  infoRowValue: {
    fontSize: 13,
    textAlign: 'right',
  },
  // List row buttons (navigation / actions)
  listRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 10,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listRowButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  // Advanced section
  advancedSection: {
    gap: 8,
    paddingTop: 4,
  },
  advancedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Competitive
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  proViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgesBlock: {
    gap: 4,
  },
  badgeItem: {
    fontSize: 13,
  },
  actionRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 8,
  },
});
