import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { RobloxFriend, RobloxPresenceType } from '@/src/features/sessions/types-v2';
import { buildTwoRowColumns } from '@/src/features/sessions/friendSelection';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface FriendPickerTwoRowHorizontalProps {
  friends: RobloxFriend[];
  selectedIds: number[];
  onToggle: (friendId: number) => void;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedCheckmark = Animated.createAnimatedComponent(View);

const PRESENCE_COLORS: Record<RobloxPresenceType, string> = {
  0: '#8E8E93', // offline — grey
  1: '#34C759', // online — green
  2: '#007AFF', // in game — blue
  3: '#AF52DE', // studio — purple
};

function FriendChip({
  friend,
  selected,
  disabled,
  isDark,
  onToggle,
}: {
  friend: RobloxFriend;
  selected: boolean;
  disabled: boolean;
  isDark: boolean;
  onToggle: (friendId: number) => void;
}) {
  const pressScale = useSharedValue(1);
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, { duration: 170 });
  }, [selected, selectedProgress]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    borderWidth: 1 + selectedProgress.value,
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [isDark ? '#2f2f2f' : '#ddd', '#007AFF']
    ),
    backgroundColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [isDark ? '#171717' : '#f8f8f8', isDark ? '#10253f' : '#EAF3FF']
    ),
  }));

  const checkmarkAnimatedStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
    transform: [{ scale: 0.85 + selectedProgress.value * 0.15 }],
  }));

  const presenceType = friend.presence?.userPresenceType;
  const isInGame = presenceType === 2;
  const presenceDotColor = presenceType != null ? PRESENCE_COLORS[presenceType] : null;
  const locationText = isInGame && friend.presence?.lastLocation
    ? friend.presence.lastLocation
    : null;

  return (
    <AnimatedPressable
      style={[styles.card, cardAnimatedStyle, disabled && styles.cardDisabled]}
      onPress={() => onToggle(friend.id)}
      onPressIn={() => {
        if (disabled) return;
        pressScale.value = withTiming(0.96, { duration: 90 });
      }}
      onPressOut={() => {
        if (disabled) return;
        pressScale.value = withSpring(1, {
          damping: 14,
          stiffness: 260,
          mass: 0.7,
        });
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      testID={`friend-chip-${friend.id}`}
    >
      <View style={styles.avatarWrap}>
        {friend.avatarUrl ? (
          <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]} />
        )}
        {presenceDotColor != null && (
          <View style={[styles.presenceDot, { backgroundColor: presenceDotColor }]} />
        )}
      </View>
      <AnimatedCheckmark style={[styles.checkmarkBadge, checkmarkAnimatedStyle]}>
        <MaterialIcons name="check" size={12} color="#fff" />
      </AnimatedCheckmark>
      <View style={styles.textStack}>
        <Text numberOfLines={1} style={[styles.name, { color: isDark ? '#e9e9e9' : '#222' }]}>
          {friend.displayName || friend.name}
        </Text>
        {locationText != null && (
          <Text numberOfLines={1} style={[styles.presenceLocation, { color: isDark ? '#6fb8ff' : '#0055cc' }]}>
            {locationText}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

export function FriendPickerTwoRowHorizontal({
  friends,
  selectedIds,
  onToggle,
  disabled = false,
}: FriendPickerTwoRowHorizontalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const columns = useMemo(() => buildTwoRowColumns(friends), [friends]);

  return (
    <View>
      <Text style={[styles.countLabel, { color: isDark ? '#a5a5a5' : '#666' }]}>
        Inviting {selectedIds.length} friend{selectedIds.length === 1 ? '' : 's'}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {columns.map((column, columnIndex) => (
          <View key={`col-${columnIndex}`} style={styles.column}>
            {column.map((friend) => (
              <FriendChip
                key={friend.id}
                friend={friend}
                selected={selectedSet.has(friend.id)}
                disabled={disabled}
                isDark={isDark}
                onToggle={onToggle}
              />
            ))}
            {column.length === 1 && <View style={styles.cardSpacer} />}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  countLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  column: {
    marginRight: 10,
    justifyContent: 'space-between',
  },
  card: {
    width: 120,
    minHeight: 70,
    borderRadius: 10,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    position: 'relative',
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardSpacer: {
    width: 120,
    minHeight: 70,
    marginBottom: 8,
  },
  avatarWrap: {
    position: 'relative',
    width: 32,
    height: 32,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ddd',
  },
  avatarFallback: {
    backgroundColor: '#ccc',
  },
  presenceDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  textStack: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  name: {
    fontSize: 12,
  },
  presenceLocation: {
    fontSize: 10,
  },
  checkmarkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0,
  },
});
