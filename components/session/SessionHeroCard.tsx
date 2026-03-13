import { useState } from 'react';
import { View, StyleSheet, Image, TextInput, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SessionVisibility } from '@/src/features/sessions/types-v2';

const VISIBILITY_LABELS: Record<SessionVisibility, string> = {
  public: 'Public',
  friends: 'Friends Only',
  invite_only: 'Invite Only',
};

interface Props {
  gameName: string;
  thumbnailUrl?: string | null;
  title: string;
  onTitleChange?: (title: string) => void;
  visibility: SessionVisibility;
  hostName: string;
}

export function SessionHeroCard({
  gameName,
  thumbnailUrl,
  title,
  onTitleChange,
  visibility,
  hostName,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [editing, setEditing] = useState(false);

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
      <View style={styles.row}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <MaterialIcons name="gamepad" size={28} color={isDark ? '#555' : '#bbb'} />
          </View>
        )}

        <View style={styles.info}>
          <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" numberOfLines={1} style={styles.gameName}>
            {gameName}
          </ThemedText>

          {editing ? (
            <TextInput
              style={[
                styles.titleInput,
                {
                  color: isDark ? '#fff' : '#000',
                  borderBottomColor: '#007AFF',
                },
              ]}
              value={title}
              onChangeText={onTitleChange}
              onBlur={() => setEditing(false)}
              autoFocus
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={() => setEditing(false)}
            />
          ) : (
            <TouchableOpacity
              style={styles.titleRow}
              onPress={() => onTitleChange && setEditing(true)}
              activeOpacity={0.7}
            >
              <ThemedText type="titleMedium" numberOfLines={2} style={styles.titleText}>
                {title}
              </ThemedText>
              {onTitleChange && (
                <MaterialIcons
                  name="edit"
                  size={15}
                  color="#007AFF"
                  style={styles.editIcon}
                />
              )}
            </TouchableOpacity>
          )}

          <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
            {VISIBILITY_LABELS[visibility]} · Host: {hostName}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  thumbnailPlaceholder: {
    backgroundColor: '#d1d1d6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  gameName: {
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  editIcon: {
    marginTop: 2,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: '600',
    borderBottomWidth: 1.5,
    paddingBottom: 2,
    paddingTop: 0,
  },
});
