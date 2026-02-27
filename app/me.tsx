import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useAuth } from '@/src/features/auth/useAuth';
import { apiClient } from '@/src/lib/api';
import { refreshFavorites } from '@/src/features/favorites/service';
import { refreshFriends } from '@/src/features/friends/service';
import { robloxConnectionService } from '@/src/features/auth/robloxConnectionService';
import { SettingsRow } from '@/src/components/settings/SettingsRow';
import { SettingsSection } from '@/src/components/settings/SettingsSection';
import { StatusIndicator } from '@/src/components/settings/StatusIndicator';
import { settingsTypography, spacing } from '@/src/components/settings/tokens';
import { logger } from '@/src/lib/logger';

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
}

interface MeResponse {
  success: boolean;
  data: MeData;
  requestId: string;
}

function formatLastSynced(syncedAt: string | null): string {
  if (!syncedAt) {
    return 'Last synced not yet';
  }

  const elapsedMs = Date.now() - new Date(syncedAt).getTime();
  const minutes = Math.max(0, Math.floor(elapsedMs / (1000 * 60)));
  if (minutes < 1) {
    return 'Last synced just now';
  }
  if (minutes < 60) {
    return `Last synced ${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `Last synced ${hours}h ago`;
}

export default function MeScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const { user } = useAuth();

  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncSuccessOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const avatarOpacity = useRef(new Animated.Value(0)).current;

  const fetchMeData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.getRaw('/api/me');
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }
      const json: MeResponse = await response.json();
      setData(json.data);
      logger.info('Auth debug status', {
        robloxConnected: json.data.roblox.connected,
        robloxUserId: json.data.roblox.robloxUserId,
        robloxUsername: json.data.roblox.username,
      });
      setLastSyncedAt((current) => current ?? new Date().toISOString());
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const showSyncSuccess = useCallback(() => {
    syncSuccessOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(syncSuccessOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(760),
      Animated.timing(syncSuccessOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [syncSuccessOpacity]);

  const handleSyncRobloxData = useCallback(async () => {
    if (!user?.id) {
      handleError(new Error('User session not available'), { fallbackMessage: 'Failed to sync Roblox data' });
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (!data?.roblox.connected) {
      try {
        setRefreshing(true);
        const result = await robloxConnectionService.connect();
        if (result.status === 'connected') {
          await fetchMeData();
          await refreshFavorites(user.id, { force: true }).catch(() => {});
          await refreshFriends(user.id, { force: true }).catch(() => {});
          showSyncSuccess();
        }
      } catch (error) {
        handleError(error, { fallbackMessage: 'Failed to connect Roblox' });
      } finally {
        setRefreshing(false);
      }
      return;
    }

    try {
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
      if (!response.ok) {
        throw new Error('Failed to refresh profile');
      }

      const json: MeResponse = await response.json();
      setData(json.data);
      setLastSyncedAt(new Date().toISOString());
      showSyncSuccess();

      if (failedActions.length > 0) {
        Alert.alert('Sync completed with issues', `Couldn't refresh: ${failedActions.join(', ')}.`);
      }
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to sync Roblox data' });
    } finally {
      setRefreshing(false);
    }
  }, [data?.roblox.connected, fetchMeData, handleError, showSyncSuccess, user?.id]);

  const openDeleteAccount = useCallback(async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    router.push('/account/delete');
  }, [router]);

  const openSettings = useCallback(() => {
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      contentOpacity.setValue(1);
      router.push('/settings');
    });
  }, [contentOpacity, router]);

  const openSafetyReport = useCallback(() => {
    router.push('/safety-report');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void fetchMeData();
    }, [fetchMeData])
  );

  const backgroundColor = colorScheme === 'dark' ? '#050507' : Colors.light.background;
  const textColor = colorScheme === 'dark' ? '#f2f2f5' : Colors.light.text;
  const secondaryTextColor = colorScheme === 'dark' ? '#94949d' : '#6e6e73';
  const topCardColor = colorScheme === 'dark' ? '#17181c' : '#f7f7fa';
  const borderColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(20,20,25,0.08)';
  const tintColor = Colors[colorScheme ?? 'light'].tint;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ title: 'Me', headerShown: true }} />
        <View style={styles.centered}>
          <LagaLoadingSpinner size={56} label="Loading profile..." />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ title: 'Me', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: textColor }]}>Failed to load profile</Text>
        </View>
      </View>
    );
  }

  const primaryName =
    data.roblox.displayName?.trim() ||
    data.roblox.username?.trim() ||
    data.appUser.displayName;

  const hasAvatar = Boolean(data.roblox.connected && data.roblox.avatarHeadshotUrl);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{ title: 'Me', headerShown: true }} />

      <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View
            style={[
              styles.topCard,
              {
                backgroundColor: topCardColor,
                borderColor,
              },
            ]}
          >
            <View style={[styles.avatarCircle, { borderColor }]}>
              {hasAvatar ? (
                <Animated.View style={{ opacity: avatarOpacity }}>
                  <Image
                    source={{ uri: data.roblox.avatarHeadshotUrl ?? undefined }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                    onLoad={() => {
                      Animated.timing(avatarOpacity, {
                        toValue: 1,
                        duration: 150,
                        useNativeDriver: true,
                      }).start();
                    }}
                  />
                </Animated.View>
              ) : null}
              {!hasAvatar ? (
                <Text style={[styles.avatarFallback, { color: tintColor }]}>
                  {primaryName.charAt(0).toUpperCase()}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.profileName, { color: textColor }]}>{primaryName}</Text>
            <StatusIndicator label={data.roblox.connected ? 'Roblox connected' : 'Roblox not connected'} />
            {data.roblox.connected && data.roblox.username ? (
              <Text style={[styles.connectedAsText, { color: secondaryTextColor }]}>
                Connected as @{data.roblox.username}
              </Text>
            ) : null}

            <SettingsRow
              label={data.roblox.connected ? 'Sync data' : 'Connect Roblox'}
              onPress={() => {
                void handleSyncRobloxData();
              }}
              rightContent={
                refreshing ? (
                  <ActivityIndicator size="small" color={secondaryTextColor} />
                ) : (
                  <Animated.Text style={[styles.syncSuccess, { opacity: syncSuccessOpacity }]}>✓</Animated.Text>
                )
              }
            />

            <Text style={[styles.syncCaption, { color: secondaryTextColor }]}>
              {formatLastSynced(lastSyncedAt)}
            </Text>
          </View>

          <View style={styles.sectionBlock}>
            <SettingsSection title="Account">
              <SettingsRow label="Settings" onPress={openSettings} />
              <SettingsRow label="Safety & Report" onPress={openSafetyReport} />
              <SettingsRow label="Delete Account" onPress={() => { void openDeleteAccount(); }} destructive />
            </SettingsSection>
          </View>

          <View style={styles.sectionBlock}>
            <SettingsSection title="Legal">
              <SettingsRow
                label="Privacy Policy"
                onPress={() => {
                  void Linking.openURL(PRIVACY_POLICY_URL);
                }}
              />
              <SettingsRow
                label="Terms of Service"
                onPress={() => {
                  void Linking.openURL(TERMS_OF_SERVICE_URL);
                }}
              />
              <Text style={[styles.disclaimerText, { color: secondaryTextColor }]}> 
                Lagalaga is not affiliated with Roblox.
              </Text>
            </SettingsSection>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  topCard: {
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: spacing.md,
  },
  avatarCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarImage: {
    width: 132,
    height: 132,
  },
  avatarFallback: {
    fontSize: 44,
    fontWeight: '600',
  },
  profileName: {
    ...settingsTypography.username,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  syncCaption: {
    ...settingsTypography.caption,
    opacity: 0.8,
    marginTop: -spacing.sm,
  },
  syncSuccess: {
    color: '#2f9e54',
    fontSize: 14,
    fontWeight: '600',
  },
  connectedAsText: {
    textAlign: 'center',
    marginTop: -10,
    marginBottom: 2,
    fontSize: 13,
  },
  sectionBlock: {
    marginTop: spacing.lg,
  },
  disclaimerText: {
    ...settingsTypography.caption,
    lineHeight: 18,
    opacity: 0.75,
  },
});
