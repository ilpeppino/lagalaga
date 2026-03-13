import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ParticipantHandoffState } from '@/src/features/sessions/types-v2';

function stateLabel(state: string, handoffState?: ParticipantHandoffState | null): string {
  if (handoffState === 'confirmed_in_game') return 'In game';
  if (handoffState === 'opened_roblox') return 'Opening Roblox';
  if (handoffState === 'rsvp_joined') return 'Joined';
  if (handoffState === 'stuck') return 'Stuck';
  if (state === 'invited') return 'Invited';
  if (state === 'joined') return 'In lobby';
  if (state === 'left') return 'Left';
  if (state === 'kicked') return 'Removed';
  return 'Invited';
}

function stateColor(state: string, handoffState?: ParticipantHandoffState | null): string {
  if (handoffState === 'confirmed_in_game') return '#34C759';
  if (handoffState === 'opened_roblox') return '#FFD60A';
  if (state === 'invited') return '#007AFF';
  if (state === 'joined') return '#34C759';
  if (state === 'left' || state === 'kicked') return '#8E8E93';
  return '#007AFF';
}

interface InvitedEntry {
  id: string;
  displayName: string | null;
  avatarUrl?: string | null;
  state: string;
  handoffState?: ParticipantHandoffState | null;
}

interface Props {
  participants: InvitedEntry[];
  onRemove?: (id: string) => void;
}

export function InvitedFriendsCard({ participants, onRemove }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (participants.length === 0) {
    return (
      <View style={[styles.emptyCard, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
        <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
          No friends invited yet. Use Quick Invite above or search below.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
      {participants.map((p, index) => (
        <View
          key={p.id}
          style={[
            styles.row,
            index < participants.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: isDark ? '#2a2a2a' : '#e0e0e0',
            },
          ]}
        >
          {p.avatarUrl ? (
            <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: '#d1d1d6' }]} />
          )}

          <View style={styles.nameWrap}>
            <ThemedText type="bodyMedium" numberOfLines={1} style={styles.name}>
              {p.displayName ?? 'Unknown'}
            </ThemedText>
            <ThemedText
              type="bodySmall"
              style={{ color: stateColor(p.state, p.handoffState) }}
            >
              {stateLabel(p.state, p.handoffState)}
            </ThemedText>
          </View>

          {onRemove && p.state !== 'left' && p.state !== 'kicked' && (
            <TouchableOpacity
              onPress={() => onRemove(p.id)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              activeOpacity={0.6}
            >
              <MaterialIcons name="close" size={18} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    borderRadius: 12,
    padding: 16,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  nameWrap: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '500',
  },
});
