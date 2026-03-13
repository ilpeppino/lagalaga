/**
 * QuickInviteStrip
 *
 * Horizontal scrollable row of smart invite suggestions.
 *
 * States:
 *   isLoading=true  → 4 skeleton chips
 *   suggestions=[]  → null (hidden)
 *   suggestions>0   → chips + "See all" button
 */

import { ScrollView, View, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { QuickInviteChip } from './QuickInviteChip';
import type { SuggestedFriend } from '@/src/features/sessions/smartInviteSuggestions';

const SKELETON_COUNT = 4;

interface Props {
  suggestions: SuggestedFriend[];
  isLoading: boolean;
  invitedIds: number[];
  onInvite: (friendId: number) => void;
  onShowMore: () => void;
}

export function QuickInviteStrip({
  suggestions,
  isLoading,
  invitedIds,
  onInvite,
  onShowMore,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Hide after load if no suggestions
  if (!isLoading && suggestions.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <ThemedText
          type="labelSmall"
          lightColor="#8E8E93"
          darkColor="#636366"
          style={styles.title}
        >
          SUGGESTED FRIENDS
        </ThemedText>
        {!isLoading && suggestions.length > 0 && (
          <TouchableOpacity onPress={onShowMore} activeOpacity={0.7}>
            <ThemedText type="labelSmall" style={styles.seeAll}>
              See all
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading
          ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <QuickInviteChip key={`skeleton-${i}`} skeleton />
            ))
          : suggestions.map((s) => (
              <QuickInviteChip
                key={s.friend.id}
                suggestion={s}
                isInvited={invitedIds.includes(s.friend.id)}
                onPress={() => onInvite(s.friend.id)}
              />
            ))}

        {/* "+" more button — only shown when loaded */}
        {!isLoading && (
          <TouchableOpacity
            style={[
              styles.moreBtn,
              {
                backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',
                borderColor: isDark ? '#3a3a3c' : '#e0e0e0',
              },
            ]}
            onPress={onShowMore}
            activeOpacity={0.7}
          >
            <View style={styles.morePlaceholder}>
              <ThemedText style={styles.morePlus}>+</ThemedText>
            </View>
            <ThemedText type="labelSmall" style={styles.moreLabel}>
              More
            </ThemedText>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  seeAll: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  strip: {
    gap: 10,
    paddingBottom: 4,
  },
  moreBtn: {
    alignItems: 'center',
    width: 72,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
  },
  morePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8f0fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  morePlus: {
    fontSize: 22,
    color: '#007AFF',
    lineHeight: 28,
  },
  moreLabel: {
    fontSize: 11,
    color: '#007AFF',
  },
});
