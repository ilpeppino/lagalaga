import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ENABLE_COMPETITIVE_DEPTH } from '@/src/lib/runtimeConfig';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { MatchHistoryEntry } from '@/src/features/sessions/types-v2';

export default function MatchHistoryScreen() {
  const colorScheme = useColorScheme();
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const response = await sessionsAPIStoreV2.getMyMatchHistory(20);
      setEntries(response.entries);
    } catch {
      setError('Failed to load match history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!ENABLE_COMPETITIVE_DEPTH) {
      setLoading(false);
      return;
    }

    void loadHistory();
  }, []);

  if (!ENABLE_COMPETITIVE_DEPTH) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <Stack.Screen options={{ title: 'Match History' }} />
        <ThemedText type="bodyMedium">Unavailable</ThemedText>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <Stack.Screen options={{ title: 'Match History' }} />
        <ActivityIndicator size="large" color="#FF6B00" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHistory(true)} />}
    >
      <Stack.Screen options={{ title: 'Match History' }} />
      {error ? (
        <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff8a80">{error}</ThemedText>
      ) : null}
      {entries.map((entry) => (
        <Card key={entry.sessionId} style={styles.row} mode="outlined">
          <View style={styles.rowContent}>
            <ThemedText type="titleMedium">{entry.sessionTitle}</ThemedText>
            <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
              {new Date(entry.playedAt).toLocaleString()}
            </ThemedText>
            <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
              {entry.result === 'win' ? 'Win' : 'Loss'} • {entry.ratingDelta > 0 ? '+' : ''}{entry.ratingDelta}
            </ThemedText>
          </View>
        </Card>
      ))}
      {!error && entries.length === 0 ? (
        <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
          No ranked matches yet.
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    borderRadius: 10,
  },
  rowContent: {
    padding: 12,
    gap: 4,
  },
});
