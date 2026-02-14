import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import type { RobloxFriend } from '@/src/features/sessions/types-v2';
import { buildTwoRowColumns } from '@/src/features/sessions/friendSelection';

interface FriendPickerTwoRowHorizontalProps {
  friends: RobloxFriend[];
  selectedIds: number[];
  onToggle: (friendId: number) => void;
  disabled?: boolean;
}

export function FriendPickerTwoRowHorizontal({
  friends,
  selectedIds,
  onToggle,
  disabled = false,
}: FriendPickerTwoRowHorizontalProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const columns = useMemo(() => buildTwoRowColumns(friends), [friends]);

  return (
    <View>
      <Text style={styles.countLabel}>Inviting {selectedIds.length} friend{selectedIds.length === 1 ? '' : 's'}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {columns.map((column, columnIndex) => (
          <View key={`col-${columnIndex}`} style={styles.column}>
            {column.map((friend) => {
              const selected = selectedSet.has(friend.id);
              return (
                <Pressable
                  key={friend.id}
                  style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
                  onPress={() => onToggle(friend.id)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  testID={`friend-chip-${friend.id}`}
                >
                  {friend.avatarUrl ? (
                    <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]} />
                  )}
                  <Text numberOfLines={1} style={styles.name}>
                    {friend.displayName || friend.name}
                  </Text>
                </Pressable>
              );
            })}
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
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  cardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#EAF3FF',
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardSpacer: {
    width: 120,
    minHeight: 70,
    marginBottom: 8,
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
  name: {
    flex: 1,
    fontSize: 12,
    color: '#222',
  },
});
