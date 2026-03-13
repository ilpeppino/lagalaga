import { useMemo } from 'react';
import { SectionList, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { FriendInviteRow } from './FriendInviteRow';
import type { RobloxFriend } from '@/src/features/sessions/types-v2';

interface Section {
  title: string;
  data: RobloxFriend[];
}

interface Props {
  friends: RobloxFriend[];
  invitedIds: number[];
  onInvite: (friendId: number) => void;
  searchQuery: string;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.sectionTitle}>
        {title}
      </ThemedText>
    </View>
  );
}

export function VirtualizedFriendList({ friends, invitedIds, onInvite, searchQuery }: Props) {
  const sections = useMemo<Section[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? friends.filter(
          (f) =>
            f.displayName.toLowerCase().includes(q) ||
            f.name.toLowerCase().includes(q)
        )
      : friends;

    if (q) {
      // No grouping when searching
      return filtered.length > 0 ? [{ title: 'RESULTS', data: filtered }] : [];
    }

    const online = filtered.filter((f) => f.presence?.userPresenceType === 1);
    const inGame = filtered.filter((f) => f.presence?.userPresenceType === 2 || f.presence?.userPresenceType === 3);
    const offline = filtered.filter((f) => !f.presence || f.presence.userPresenceType === 0);

    const sections: Section[] = [];
    if (online.length > 0) sections.push({ title: 'ONLINE', data: online });
    if (inGame.length > 0) sections.push({ title: 'IN GAME', data: inGame });
    if (offline.length > 0) sections.push({ title: 'ALL FRIENDS', data: offline });
    if (sections.length === 0 && filtered.length > 0) {
      sections.push({ title: 'ALL FRIENDS', data: filtered });
    }
    return sections;
  }, [friends, searchQuery]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <FriendInviteRow
          friend={item}
          isInvited={invitedIds.includes(item.id)}
          onInvite={() => onInvite(item.id)}
        />
      )}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
