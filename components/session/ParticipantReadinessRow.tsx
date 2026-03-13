/**
 * ParticipantReadinessRow
 *
 * Compact participant row for the squad readiness list.
 * Uses initials avatar (no avatar URL in SessionParticipant type).
 */

import { View, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getHandoffStateUi } from '@/src/lib/handoffStatePresenter';
import type { ParticipantHandoffState } from '@/src/features/sessions/types-v2';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// Stable color from name (deterministic, no random)
const AVATAR_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5AC8FA',
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface Props {
  displayName: string;
  isHost?: boolean;
  handoffState?: ParticipantHandoffState | null;
  participantState?: string;
}

export function ParticipantReadinessRow({
  displayName,
  isHost = false,
  handoffState,
  participantState,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const ui = getHandoffStateUi(handoffState, participantState);
  const bgColor = avatarColor(displayName);

  return (
    <View style={styles.row}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: bgColor }]}>
        <ThemedText style={styles.initials} lightColor="#fff" darkColor="#fff">
          {initials(displayName)}
        </ThemedText>
      </View>

      {/* Name + role */}
      <View style={styles.nameWrap}>
        <View style={styles.nameRow}>
          <ThemedText type="bodyMedium" numberOfLines={1} style={styles.name}>
            {displayName}
          </ThemedText>
          {isHost && (
            <View style={[styles.hostBadge, { backgroundColor: isDark ? '#1c3a5c' : '#e8f0fe' }]}>
              <ThemedText style={[styles.hostBadgeText, { color: '#007AFF' }]}>
                Host
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* Status */}
      <View style={styles.statusWrap}>
        <MaterialIcons
          name={ui.iconName as any}
          size={14}
          color={ui.color}
          style={styles.statusIcon}
        />
        <ThemedText style={[styles.statusLabel, { color: ui.color }]} numberOfLines={1}>
          {ui.label}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  initials: {
    fontSize: 13,
    fontWeight: '700',
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontWeight: '500',
    flexShrink: 1,
  },
  hostBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  hostBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    maxWidth: 130,
  },
  statusIcon: {},
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
