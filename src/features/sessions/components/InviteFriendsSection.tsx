import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FriendPickerTwoRowHorizontal } from '@/components/FriendPickerTwoRowHorizontal';
import { ThemedText } from '@/components/themed-text';
import { TextInput } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { RobloxFriend } from '@/src/features/sessions/types-v2';
import { createSessionPalette, spacing } from './createSessionTokens';

interface InviteFriendsSectionProps {
  friends: RobloxFriend[];
  selectedFriendIds: number[];
  onToggleFriend: (friendId: number) => void;
  friendSearch: string;
  onChangeFriendSearch: (value: string) => void;
  isLoadingFriends: boolean;
  isRefreshingFriends: boolean;
  friendsError: string | null;
  friendsSyncedAt: string | null;
  robloxNotConnected: boolean;
  isCreating: boolean;
  onRefreshFriends: () => void;
  onReloadFriends: () => void;
  onConnectRoblox: () => void;
}

function formatSyncedAgo(syncedAt: string): string {
  const diffMin = Math.floor((Date.now() - new Date(syncedAt).getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1 min ago';
  return `${diffMin} min ago`;
}

export function InviteFriendsSection({
  friends,
  selectedFriendIds,
  onToggleFriend,
  friendSearch,
  onChangeFriendSearch,
  isLoadingFriends,
  isRefreshingFriends,
  friendsError,
  friendsSyncedAt,
  robloxNotConnected,
  isCreating,
  onRefreshFriends,
  onReloadFriends,
  onConnectRoblox,
}: InviteFriendsSectionProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? createSessionPalette.dark : createSessionPalette.light;

  return (
    <View>
      <View style={styles.headerRow}>
        <ThemedText type="titleSmall" lightColor={palette.textTertiary} darkColor={palette.textTertiary} style={styles.sectionLabel}>
          Invite friends
        </ThemedText>
        {friendsSyncedAt && (
          <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary} style={styles.syncedCaption}>
            Synced {formatSyncedAgo(friendsSyncedAt)}
          </ThemedText>
        )}
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={friendSearch}
          onChangeText={onChangeFriendSearch}
          placeholder="Search friends"
          placeholderTextColor={palette.placeholder}
          style={styles.searchInput}
          editable={!isCreating && !isLoadingFriends}
        />
        <Pressable
          style={[styles.refreshButton, { backgroundColor: palette.surfaceRaised }]}
          onPress={onRefreshFriends}
          disabled={isCreating || isRefreshingFriends || isLoadingFriends}
        >
          {isRefreshingFriends ? (
            <ActivityIndicator size="small" color={palette.accent} />
          ) : (
            <MaterialIcons name="refresh" size={18} color={palette.accent} />
          )}
        </Pressable>
      </View>

      {selectedFriendIds.length > 0 && (
        <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary} style={styles.selectedCount}>
          Inviting {selectedFriendIds.length} friend{selectedFriendIds.length === 1 ? '' : 's'}
        </ThemedText>
      )}

      {isLoadingFriends ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={palette.accent} />
        </View>
      ) : null}

      {!isLoadingFriends && robloxNotConnected ? (
        <View style={[styles.infoCard, { backgroundColor: palette.surface }]}> 
          <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary}>
            Connect Roblox to invite friends directly.
          </ThemedText>
          <Pressable onPress={onConnectRoblox}>
            <ThemedText type="labelLarge" lightColor={palette.accent} darkColor={palette.accent}>
              Connect Roblox
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {!isLoadingFriends && !robloxNotConnected && friendsError ? (
        <View style={[styles.infoCard, { backgroundColor: palette.surface }]}> 
          <ThemedText type="bodySmall" lightColor={createSessionPalette.light.dangerText} darkColor={createSessionPalette.dark.dangerText}>
            {friendsError}
          </ThemedText>
          <Pressable onPress={onReloadFriends}>
            <ThemedText type="labelLarge" lightColor={palette.accent} darkColor={palette.accent}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {!isLoadingFriends && !robloxNotConnected && !friendsError && friends.length === 0 ? (
        <View style={styles.emptyFriendsContainer}>
          <ThemedText type="bodyMedium" lightColor={palette.textSecondary} darkColor={palette.textSecondary}>
            No friends yet.
          </ThemedText>
          <ThemedText type="bodySmall" lightColor={palette.textTertiary} darkColor={palette.textTertiary}>
            Add friends from the Friends tab.
          </ThemedText>
        </View>
      ) : null}

      {!isLoadingFriends && !robloxNotConnected && !friendsError && friends.length > 0 && (
        <FriendPickerTwoRowHorizontal
          friends={friends}
          selectedIds={selectedFriendIds}
          onToggle={onToggleFriend}
          disabled={isCreating || isRefreshingFriends}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  syncedCaption: {
    textAlign: 'right',
    fontSize: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    borderRadius: 12,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCount: {
    marginBottom: spacing.md,
    fontSize: 12,
  },
  loadingWrap: {
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyFriendsContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
});
