import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { RobloxFriend } from '@/src/features/sessions/types-v2';
import { buildTwoRowColumns } from '@/src/features/sessions/friendSelection';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
            {column.map((friend) => {
              const selected = selectedSet.has(friend.id);
              return (
                <Pressable
                  key={friend.id}
                  style={[
                    styles.card,
                    {
                      borderColor: isDark ? '#2f2f2f' : '#ddd',
                      backgroundColor: isDark ? '#171717' : '#f8f8f8',
                    },
                    selected && styles.cardSelected,
                    selected && {
                      borderColor: '#007AFF',
                      backgroundColor: isDark ? '#10253f' : '#EAF3FF',
                    },
                    disabled && styles.cardDisabled,
                  ]}
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
                  {selected && (
                    <View style={styles.checkmarkBadge}>
                      <MaterialIcons name="check" size={12} color="#fff" />
                    </View>
                  )}
                  <Text numberOfLines={1} style={[styles.name, { color: isDark ? '#e9e9e9' : '#222' }]}>
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
    borderRadius: 10,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    position: 'relative',
  },
  cardSelected: {
    borderWidth: 2,
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
  },
});
