/**
 * QuickInviteChip
 *
 * Compact invite chip for the QuickInviteStrip.
 * Variants: normal (with friend data), skeleton (loading placeholder).
 */

import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SuggestedFriend } from '@/src/features/sessions/smartInviteSuggestions';

// ---------------------------------------------------------------------------
// Presence dot color
// ---------------------------------------------------------------------------

function presenceDotColor(presenceType: number | undefined): string | null {
  if (presenceType === 1) return '#34C759'; // online
  if (presenceType === 2 || presenceType === 3) return '#FFD60A'; // in game / studio
  return null; // offline — no dot
}

// ---------------------------------------------------------------------------
// Skeleton chip
// ---------------------------------------------------------------------------

function SkeletonChip() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',
          borderColor: isDark ? '#2a2a2a' : '#e8e8e8',
        },
      ]}
    >
      <View style={[styles.avatarWrap]}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: isDark ? '#2a2a2a' : '#e0e0e0' },
          ]}
        />
      </View>
      <View style={[styles.skeletonName, { backgroundColor: isDark ? '#2a2a2a' : '#e0e0e0' }]} />
      <View style={[styles.skeletonLabel, { backgroundColor: isDark ? '#222' : '#ebebeb' }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Normal chip
// ---------------------------------------------------------------------------

interface Props {
  suggestion: SuggestedFriend;
  isInvited: boolean;
  onPress: () => void;
  skeleton?: false;
}

interface SkeletonProps {
  skeleton: true;
}

export function QuickInviteChip(props: Props | SkeletonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if ('skeleton' in props && props.skeleton) {
    return <SkeletonChip />;
  }

  const { suggestion, isInvited, onPress } = props as Props;
  const { friend, reasonLabel } = suggestion;
  const dotColor = presenceDotColor(friend.presence?.userPresenceType);

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',
          borderColor: isInvited
            ? '#34C759'
            : isDark
            ? '#3a3a3c'
            : '#e0e0e0',
        },
        isInvited && styles.chipInvited,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Avatar + presence dot + invited badge */}
      <View style={styles.avatarWrap}>
        {friend.avatarUrl ? (
          <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#d1d1d6' }]} />
        )}

        {dotColor && !isInvited && (
          <View style={[styles.presenceDot, { backgroundColor: dotColor }]} />
        )}

        {isInvited && (
          <View style={styles.invitedBadge}>
            <ThemedText style={styles.invitedCheck}>✓</ThemedText>
          </View>
        )}
      </View>

      {/* Name */}
      <ThemedText
        numberOfLines={1}
        style={[styles.name, isInvited && styles.nameInvited]}
        lightColor={isInvited ? '#34C759' : '#000'}
        darkColor={isInvited ? '#34C759' : '#fff'}
      >
        {friend.displayName || friend.name}
      </ThemedText>

      {/* Reason label */}
      <ThemedText
        numberOfLines={1}
        style={styles.reasonLabel}
        lightColor="#8E8E93"
        darkColor="#636366"
      >
        {isInvited ? 'Invited' : reasonLabel}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    width: 72,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
  },
  chipInvited: {},
  avatarWrap: {
    position: 'relative',
    marginBottom: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  presenceDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  invitedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitedCheck: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  name: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
  },
  nameInvited: {},
  reasonLabel: {
    fontSize: 10,
    textAlign: 'center',
    width: '100%',
  },
  // skeleton
  skeletonName: {
    width: 44,
    height: 9,
    borderRadius: 5,
    marginTop: 2,
  },
  skeletonLabel: {
    width: 34,
    height: 8,
    borderRadius: 4,
  },
});
