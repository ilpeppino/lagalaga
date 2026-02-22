import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiClient } from '@/src/lib/api';
import { ENABLE_COMPETITIVE_DEPTH } from '@/src/lib/runtimeConfig';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import * as Notifications from 'expo-notifications';
import { getCachedPushToken, getLastRegistrationTime } from '@/src/features/notifications/registerPushToken';

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

export default function MeScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { handleError } = useErrorHandler();
  
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [proViewEnabled, setProViewEnabled] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [debugPushToken, setDebugPushToken] = useState<string | null>(null);
  const [debugPermissionStatus, setDebugPermissionStatus] = useState<string>('unknown');
  const [debugLastRegistered, setDebugLastRegistered] = useState<number | null>(null);
  const [debugLastPushReceivedAt, setDebugLastPushReceivedAt] = useState<number | null>(null);

  // Track last invite push received while on this screen
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type;
      if (type === 'session_invite') {
        setDebugLastPushReceivedAt(Date.now());
      }
    });
    return () => sub.remove();
  }, []);

  const fetchMeData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.getRaw('/api/me');
      
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const json: MeResponse = await response.json();
      setData(json.data);
      setDebugPushToken(getCachedPushToken());
      setDebugLastRegistered(getLastRegistrationTime());
      const { status } = await Notifications.getPermissionsAsync();
      setDebugPermissionStatus(status);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const handleRefreshAvatar = async () => {
    try {
      setRefreshing(true);
      // Re-fetch the /api/me endpoint, which will fetch a fresh avatar
      const response = await apiClient.getRaw('/api/me');
      
      if (!response.ok) {
        throw new Error('Failed to refresh avatar');
      }

      const json: MeResponse = await response.json();
      setData(json.data);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to refresh avatar' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleConnectRoblox = () => {
    // Navigate to existing Roblox connect flow
    router.push('/roblox');
  };

  const openMatchHistory = () => {
    router.push('/match-history');
  };

  const openDeleteAccount = () => {
    router.push('/account/delete');
  };

  const openSettings = () => {
    router.push('/settings');
  };

  const openSafetyReport = () => {
    router.push('/safety-report');
  };

  const openProfileOverflowMenu = () => {
    Alert.alert('Profile options', 'Choose an action', [
      { text: 'Safety & Report', onPress: openSafetyReport },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const formatCountdown = (endDate: string | null): string => {
    if (!endDate) {
      return 'N/A';
    }

    const diffMs = new Date(endDate).getTime() - Date.now();
    if (diffMs <= 0) {
      return 'Ending soon';
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    return `${days}d ${hours}h`;
  };

  // Fetch data on screen focus
  useFocusEffect(
    useCallback(() => {
      void fetchMeData();
    }, [fetchMeData])
  );

  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const textColor = Colors[colorScheme ?? 'light'].text;
  const cardColor = colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7';
  const tintColor = Colors[colorScheme ?? 'light'].tint;
  const primaryButtonColor = colorScheme === 'dark' ? '#0a84ff' : tintColor;
  const rowBorderColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)';
  const secondaryTextColor = colorScheme === 'dark' ? '#b3b3b8' : '#5f6368';

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen
          options={{
            title: 'Me',
            headerShown: true,
            headerRight: () => (
              <TouchableOpacity onPress={openProfileOverflowMenu} style={styles.headerMenuButton}>
                <IconSymbol name="ellipsis.circle" size={22} color={tintColor} />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tintColor} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen
          options={{
            title: 'Me',
            headerShown: true,
            headerRight: () => (
              <TouchableOpacity onPress={openProfileOverflowMenu} style={styles.headerMenuButton}>
                <IconSymbol name="ellipsis.circle" size={22} color={tintColor} />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: textColor }]}>
            Failed to load profile
          </Text>
        </View>
      </View>
    );
  }

  const primaryName =
    data.roblox.displayName?.trim() ||
    data.roblox.username?.trim() ||
    data.appUser.displayName;
  const robloxAccountName =
    data.roblox.username?.trim() ||
    data.roblox.displayName?.trim() ||
    null;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Stack.Screen
        options={{
          title: 'Me',
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity onPress={openProfileOverflowMenu} style={styles.headerMenuButton}>
              <IconSymbol name="ellipsis.circle" size={22} color={tintColor} />
            </TouchableOpacity>
          ),
        }}
      />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, { backgroundColor: cardColor }]}>
            {data.roblox.connected && data.roblox.avatarHeadshotUrl ? (
              <Image
                source={{ uri: data.roblox.avatarHeadshotUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <IconSymbol name="person.fill" size={64} color={tintColor} />
            )}
          </View>
          <Text style={[styles.profileName, { color: textColor }]}>{primaryName}</Text>
          <Text style={[styles.profileStatus, { color: secondaryTextColor }]}>
            {data.roblox.connected ? 'Roblox connected' : 'Roblox not connected'}
          </Text>
        </View>

        {data.appUser.email ? (
          <View style={[styles.card, { backgroundColor: cardColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Account email
            </Text>
            <View style={[styles.infoRow, styles.infoRowLast, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.label, { color: textColor }]}>Email:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.appUser.email}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Roblox Connection Status */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Roblox
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: data.roblox.connected
                    ? '#34c75933'
                    : colorScheme === 'dark'
                      ? '#8e8e9333'
                      : '#8e8e931f',
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: data.roblox.connected ? '#2e7d32' : secondaryTextColor }]}>
                {data.roblox.connected ? 'Connected' : 'Not Connected'}
              </Text>
            </View>
          </View>

          {data.roblox.connected ? (
            <>
              {robloxAccountName ? (
                <View style={[styles.infoRow, styles.infoRowLast, { borderBottomColor: rowBorderColor }]}>
                  <Text style={[styles.label, { color: textColor }]}>Roblox account:</Text>
                  <Text style={[styles.value, { color: textColor }]}>
                    {robloxAccountName}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.advancedToggle, { borderColor: rowBorderColor }]}
                onPress={() => setAdvancedExpanded((v) => !v)}
                accessibilityRole="button"
              >
                <Text style={[styles.advancedLabel, { color: textColor }]}>Advanced</Text>
                <View style={{ transform: [{ rotate: advancedExpanded ? '180deg' : '0deg' }] }}>
                  <IconSymbol name="chevron.down" size={14} color={secondaryTextColor} />
                </View>
              </TouchableOpacity>

              {advancedExpanded ? (
                <View style={styles.advancedSection}>
                  {data.roblox.robloxUserId ? (
                    <View style={[
                      styles.infoRow,
                      !data.roblox.verifiedAt ? styles.infoRowLast : null,
                      { borderBottomColor: rowBorderColor }
                    ]}>
                      <Text style={[styles.label, { color: textColor }]}>
                        Roblox ID:
                      </Text>
                      <Text style={[styles.value, { color: textColor }]}>
                        {data.roblox.robloxUserId}
                      </Text>
                    </View>
                  ) : null}
                  {data.roblox.verifiedAt ? (
                    <View style={[styles.infoRow, styles.infoRowLast, { borderBottomColor: rowBorderColor }]}>
                      <Text style={[styles.label, { color: textColor }]}>
                        Connected on:
                      </Text>
                      <Text style={[styles.value, { color: textColor }]}>
                        {new Date(data.roblox.verifiedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Refresh Avatar Button */}
              <TouchableOpacity
                style={[styles.button, styles.primaryButtonSolid, { backgroundColor: primaryButtonColor }]}
                onPress={handleRefreshAvatar}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <IconSymbol name="arrow.clockwise" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Refresh Roblox data</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.notConnectedText, { color: textColor }]}>
                Connect your Roblox account to access all features.
              </Text>

              {/* Connect Roblox Button */}
              <TouchableOpacity
                style={[styles.button, styles.primaryButtonSolid, { backgroundColor: primaryButtonColor }]}
                onPress={handleConnectRoblox}
              >
                <IconSymbol name="link" size={20} color="#fff" />
                <Text style={styles.buttonText}>Connect Roblox</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            Account
          </Text>
          <Text style={[styles.notConnectedText, { color: textColor }]}>
            Manage sign-in and account deletion settings.
          </Text>

          <TouchableOpacity
            style={[styles.listRowButton, { borderColor: rowBorderColor }]}
            onPress={openSettings}
          >
            <Text style={[styles.listRowButtonText, { color: textColor }]}>Settings</Text>
            <IconSymbol name="chevron.right" size={16} color={secondaryTextColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.dangerButton, styles.primaryButtonSolid]}
            onPress={openDeleteAccount}
          >
            <IconSymbol name="trash.fill" size={20} color="#fff" />
            <Text style={styles.buttonText}>Delete Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButtonSolid, { backgroundColor: primaryButtonColor }]}
            onPress={openSafetyReport}
          >
            <IconSymbol name="exclamationmark.shield.fill" size={20} color="#fff" />
            <Text style={styles.buttonText}>Safety & Report</Text>
          </TouchableOpacity>
        </View>

        {/* Push Notifications Debug */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Push Notifications</Text>
          <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
            <Text style={[styles.label, { color: textColor }]}>Platform:</Text>
            <Text style={[styles.value, { color: textColor }]}>{Platform.OS}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
            <Text style={[styles.label, { color: textColor }]}>Permission:</Text>
            <Text style={[styles.value, { color: debugPermissionStatus === 'granted' ? '#2e7d32' : '#c62828' }]}>{debugPermissionStatus}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
            <Text style={[styles.label, { color: textColor }]}>Token:</Text>
            <Text style={[styles.value, { color: secondaryTextColor }]} numberOfLines={1} ellipsizeMode="middle">
              {debugPushToken ? `…${debugPushToken.slice(-24)}` : 'Not registered'}
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
            <Text style={[styles.label, { color: textColor }]}>Registered:</Text>
            <Text style={[styles.value, { color: secondaryTextColor }]}>
              {debugLastRegistered ? new Date(debugLastRegistered).toLocaleTimeString() : 'Not yet'}
            </Text>
          </View>
          <View style={[styles.infoRow, styles.infoRowLast, { borderBottomColor: rowBorderColor }]}>
            <Text style={[styles.label, { color: textColor }]}>Last push received:</Text>
            <Text style={[styles.value, { color: secondaryTextColor }]}>
              {debugLastPushReceivedAt ? new Date(debugLastPushReceivedAt).toLocaleTimeString() : 'None this session'}
            </Text>
          </View>
        </View>

        {ENABLE_COMPETITIVE_DEPTH && data.competitive ? (
          <View style={[styles.card, { backgroundColor: cardColor }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                Competitive Profile
              </Text>
              <View style={styles.proViewToggleRow}>
                <Text style={[styles.label, { color: textColor }]}>Pro View</Text>
                <Switch
                  value={proViewEnabled}
                  onValueChange={setProViewEnabled}
                  trackColor={{ false: '#767577', true: tintColor }}
                />
              </View>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.label, { color: textColor }]}>Tier:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.competitive.tier.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.label, { color: textColor }]}>Rating:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.competitive.rating}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.label, { color: textColor }]}>Season:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.competitive.currentSeasonNumber ? `S${data.competitive.currentSeasonNumber}` : 'N/A'}
              </Text>
            </View>
            <View style={[styles.infoRow, styles.infoRowLast, { borderBottomColor: rowBorderColor }]}>
              <Text style={[styles.label, { color: textColor }]}>Season Ends In:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {formatCountdown(data.competitive.seasonEndsAt)}
              </Text>
            </View>

            {proViewEnabled ? (
              <View style={styles.badgesBlock}>
                <Text style={[styles.label, { color: textColor }]}>Season Badges</Text>
                {data.competitive.badges.length === 0 ? (
                  <Text style={[styles.value, { color: textColor }]}>No badges yet</Text>
                ) : (
                  data.competitive.badges.map((badge) => (
                    <Text key={`${badge.seasonNumber}-${badge.finalRating}`} style={[styles.value, { color: textColor }]}>
                      {`S${badge.seasonNumber}: ${badge.tier.toUpperCase()} (${badge.finalRating})`}
                    </Text>
                  ))
                )}
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, styles.primaryButtonSolid, { backgroundColor: primaryButtonColor }]}
              onPress={openMatchHistory}
            >
              <IconSymbol name="list.bullet.rectangle" size={20} color="#fff" />
              <Text style={styles.buttonText}>View Match History</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  proViewToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgesBlock: {
    gap: 6,
    marginBottom: 12,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerMenuButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 8,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 12,
  },
  profileStatus: {
    fontSize: 14,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  notConnectedText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  primaryButtonSolid: {
    marginTop: 14,
  },
  dangerButton: {
    marginTop: 12,
    backgroundColor: '#c62828',
  },
  advancedToggle: {
    marginTop: 12,
    marginBottom: 4,
    minHeight: 40,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  advancedLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  advancedSection: {
    marginBottom: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listRowButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listRowButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
