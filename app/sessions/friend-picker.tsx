/**
 * FriendPickerScreen
 *
 * Full-screen friend list with search + presence indicators.
 * Invite action shares the session invite link.
 * Opens from SessionLobbyScreen.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText } from '@/components/themed-text';
import { TextInput } from '@/components/ui/paper';
import { VirtualizedFriendList } from '@/components/friends/VirtualizedFriendList';
import { useFriends } from '@/src/features/friends/useFriends';
import { useAuth } from '@/src/features/auth/useAuth';
import type { RobloxFriend, RobloxFriendPresence } from '@/src/features/sessions/types-v2';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';

export default function FriendPickerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const params = useLocalSearchParams<{ inviteLink?: string }>();
  const inviteLink = params.inviteLink ?? '';

  const {
    friends,
    isLoading,
    robloxNotConnected,
  } = useFriends(user?.id);

  const [search, setSearch] = useState('');
  const [invitedIds, setInvitedIds] = useState<number[]>([]);
  const [presenceMap, setPresenceMap] = useState<Map<number, RobloxFriendPresence>>(new Map());

  const hasFetchedPresence = useRef(false);

  useEffect(() => {
    if (friends.length === 0 || hasFetchedPresence.current) return;
    hasFetchedPresence.current = true;
    void (async () => {
      try {
        const map = await sessionsAPIStoreV2.fetchBulkPresence(friends.map((f) => f.id));
        setPresenceMap(map);
      } catch {
        // best-effort
      }
    })();
  }, [friends]);

  const friendsWithPresence = useMemo<RobloxFriend[]>(
    () => friends.map((f) => ({ ...f, presence: presenceMap.get(f.id) })),
    [friends, presenceMap]
  );

  const handleInvite = useCallback(
    async (friendId: number) => {
      setInvitedIds((prev) =>
        prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
      );

      if (!inviteLink) return;

      // Share invite link
      try {
        await Share.share({ message: inviteLink });
      } catch {
        // user cancelled share — that's fine
      }
    },
    [inviteLink]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Search */}
      <View style={[styles.searchWrap, { borderBottomColor: isDark ? '#2a2a2a' : '#e0e0e0' }]}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search friends..."
          variant="outlined"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : robloxNotConnected ? (
        <View style={styles.center}>
          <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
            Connect Roblox to invite friends.
          </ThemedText>
        </View>
      ) : (
        <VirtualizedFriendList
          friends={friendsWithPresence}
          invitedIds={invitedIds}
          onInvite={handleInvite}
          searchQuery={search}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    borderRadius: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
});
