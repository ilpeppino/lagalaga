import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiClient } from '@/src/lib/api';

interface FriendsPayload {
  lagalaFriends?: Array<{
    userId: string;
    robloxDisplayName?: string | null;
    robloxUsername?: string | null;
    friendshipId: string;
  }>;
  requests?: {
    incoming?: Array<{ friendshipId: string; fromUser: { robloxDisplayName?: string | null; robloxUsername?: string | null } }>;
    outgoing?: Array<{ friendshipId: string; toUser: { robloxDisplayName?: string | null; robloxUsername?: string | null } }>;
  };
  robloxSuggestions?: {
    onApp?: Array<{ userId: string; robloxDisplayName?: string | null; robloxUsername?: string | null }>;
    syncedAt?: string | null;
    isStale?: boolean;
  };
}

function displayName(display?: string | null, username?: string | null): string {
  return display || username || 'Unknown user';
}

export default function FriendsTabScreen() {
  const [data, setData] = useState<FriendsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiClient.friends.list('all');
      setData(response.data ?? response);
    } catch (error) {
      Alert.alert('Friends', 'Failed to load friends right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await apiClient.friends.refresh();
    } catch {
      // Keep existing list if refresh fails.
    }
    await load();
  }, [load]);

  const sendFriendRequest = useCallback(async (targetUserId: string) => {
    try {
      await apiClient.friends.sendRequest(targetUserId);
      await load();
    } catch {
      Alert.alert('Friends', 'Could not send friend request.');
    }
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      <ThemedText type="title">Friends</ThemedText>

      {loading ? (
        <ThemedText>Loading friends...</ThemedText>
      ) : (
        <>
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Requests</ThemedText>
            <ThemedText>Incoming: {data?.requests?.incoming?.length ?? 0}</ThemedText>
            <ThemedText>Outgoing: {data?.requests?.outgoing?.length ?? 0}</ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">LagaLaga Friends</ThemedText>
            {(data?.lagalaFriends ?? []).length === 0 ? (
              <ThemedText>No friends yet.</ThemedText>
            ) : (
              (data?.lagalaFriends ?? []).map((friend) => (
                <ThemedText key={friend.friendshipId}>
                  {displayName(friend.robloxDisplayName, friend.robloxUsername)}
                </ThemedText>
              ))
            )}
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Roblox Suggestions</ThemedText>
            <ThemedText>
              Last synced: {data?.robloxSuggestions?.syncedAt ?? 'never'}{data?.robloxSuggestions?.isStale ? ' (stale)' : ''}
            </ThemedText>

            {(data?.robloxSuggestions?.onApp ?? []).slice(0, 20).map((user) => (
              <View key={user.userId} style={styles.row}>
                <ThemedText style={styles.rowText}>{displayName(user.robloxDisplayName, user.robloxUsername)}</ThemedText>
                <Pressable style={styles.button} onPress={() => void sendFriendRequest(user.userId)}>
                  <ThemedText style={styles.buttonText}>Add</ThemedText>
                </Pressable>
              </View>
            ))}
          </ThemedView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowText: {
    flex: 1,
  },
  button: {
    backgroundColor: '#1f6bff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
