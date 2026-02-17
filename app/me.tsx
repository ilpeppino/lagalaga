import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Switch,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiClient } from '@/src/lib/api';
import { ENABLE_COMPETITIVE_DEPTH } from '@/src/lib/runtimeConfig';
import { useErrorHandler } from '@/hooks/useErrorHandler';

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

  const fetchMeData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.getRaw('/api/me');
      
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const json: MeResponse = await response.json();
      setData(json.data);
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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ title: 'Me', headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tintColor} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ title: 'Me', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: textColor }]}>
            Failed to load profile
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{ title: 'Me', headerShown: true }} />
      
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
        </View>

        {/* App User Info */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            LagaLaga Identity
          </Text>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: textColor }]}>Display Name:</Text>
            <Text style={[styles.value, { color: textColor }]}>
              {data.appUser.displayName}
            </Text>
          </View>
          {data.appUser.email && (
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: textColor }]}>Email:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.appUser.email}
              </Text>
            </View>
          )}
        </View>

        {/* Roblox Connection Status */}
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Roblox Connection
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: data.roblox.connected
                    ? '#34c759'
                    : Colors[colorScheme ?? 'light'].icon,
                },
              ]}
            >
              <Text style={styles.badgeText}>
                {data.roblox.connected ? 'Connected' : 'Not Connected'}
              </Text>
            </View>
          </View>

          {data.roblox.connected ? (
            <>
              {data.roblox.username && (
                <View style={styles.infoRow}>
                  <Text style={[styles.label, { color: textColor }]}>Username:</Text>
                  <Text style={[styles.value, { color: textColor }]}>
                    {data.roblox.username}
                  </Text>
                </View>
              )}
              {data.roblox.displayName && (
                <View style={styles.infoRow}>
                  <Text style={[styles.label, { color: textColor }]}>
                    Display Name:
                  </Text>
                  <Text style={[styles.value, { color: textColor }]}>
                    {data.roblox.displayName}
                  </Text>
                </View>
              )}
              {data.roblox.robloxUserId && (
                <View style={styles.infoRow}>
                  <Text style={[styles.label, { color: textColor }]}>
                    Roblox ID:
                  </Text>
                  <Text style={[styles.value, { color: textColor }]}>
                    {data.roblox.robloxUserId}
                  </Text>
                </View>
              )}
              {data.roblox.verifiedAt && (
                <View style={styles.infoRow}>
                  <Text style={[styles.label, { color: textColor }]}>
                    Verified:
                  </Text>
                  <Text style={[styles.value, { color: textColor }]}>
                    {new Date(data.roblox.verifiedAt).toLocaleDateString()}
                  </Text>
                </View>
              )}

              {/* Refresh Avatar Button */}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: tintColor }]}
                onPress={handleRefreshAvatar}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <IconSymbol name="arrow.clockwise" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Refresh Roblox Avatar</Text>
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
                style={[styles.button, styles.primaryButton, { backgroundColor: tintColor }]}
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
            style={[styles.button, styles.dangerButton]}
            onPress={openDeleteAccount}
          >
            <IconSymbol name="trash.fill" size={20} color="#fff" />
            <Text style={styles.buttonText}>Delete Account</Text>
          </TouchableOpacity>
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

            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: textColor }]}>Tier:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.competitive.tier.toUpperCase()}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: textColor }]}>Rating:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.competitive.rating}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: textColor }]}>Season:</Text>
              <Text style={[styles.value, { color: textColor }]}>
                {data.competitive.currentSeasonNumber ? `S${data.competitive.currentSeasonNumber}` : 'N/A'}
              </Text>
            </View>
            <View style={styles.infoRow}>
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
              style={[styles.button, { backgroundColor: tintColor }]}
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
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
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
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  primaryButton: {
    marginTop: 16,
  },
  dangerButton: {
    marginTop: 12,
    backgroundColor: '#c62828',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
