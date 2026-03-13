import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { RobloxFriend } from '@/src/features/sessions/types-v2';

function presenceColor(type?: number): string {
  if (type === 1) return '#34C759'; // online
  if (type === 2) return '#FFD60A'; // in game
  if (type === 3) return '#BF5AF2'; // studio
  return '#8E8E93'; // offline
}

function presenceLabel(type?: number): string {
  if (type === 1) return 'Online';
  if (type === 2) return 'In game';
  if (type === 3) return 'In Studio';
  return 'Offline';
}

interface Props {
  friend: RobloxFriend;
  isInvited: boolean;
  onInvite: () => void;
}

export function FriendInviteRow({ friend, isInvited, onInvite }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.row, { borderBottomColor: isDark ? '#2a2a2a' : '#f0f0f0' }]}>
      <View style={styles.avatarWrap}>
        {friend.avatarUrl ? (
          <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]} />
        )}
        <View style={[styles.presenceDot, { backgroundColor: presenceColor(friend.presence?.userPresenceType) }]} />
      </View>

      <View style={styles.nameWrap}>
        <ThemedText type="bodyLarge" numberOfLines={1} style={styles.displayName}>
          {friend.displayName || friend.name}
        </ThemedText>
        <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366" numberOfLines={1}>
          {presenceLabel(friend.presence?.userPresenceType)}
          {friend.presence?.lastLocation ? ` · ${friend.presence.lastLocation}` : ''}
        </ThemedText>
      </View>

      <TouchableOpacity
        style={[
          styles.inviteBtn,
          isInvited
            ? { backgroundColor: isDark ? '#1c3a1c' : '#e6f7ec', borderColor: '#34C759' }
            : { backgroundColor: isDark ? '#1c2a3a' : '#e6f0ff', borderColor: '#007AFF' },
        ]}
        onPress={onInvite}
        activeOpacity={0.7}
      >
        <ThemedText
          type="labelMedium"
          style={{ color: isInvited ? '#34C759' : '#007AFF', fontWeight: '600' }}
        >
          {isInvited ? 'INVITED' : 'INVITE'}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    backgroundColor: '#d0d0d0',
  },
  presenceDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameWrap: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontWeight: '500',
  },
  inviteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});
