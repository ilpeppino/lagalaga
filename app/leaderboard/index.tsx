import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { ActivityIndicator, Card } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { LeaderboardEntry } from '@/src/features/sessions/types-v2';
import { useAuth } from '@/src/features/auth/useAuth';
import { ENABLE_COMPETITIVE_DEPTH } from '@/src/lib/runtimeConfig';

export default function LeaderboardScreen() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const response = await sessionsAPIStoreV2.getLeaderboard('weekly');
      setEntries(response.entries);
    } catch {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <ActivityIndicator size="large" color="#FF6B00" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadLeaderboard(true)} />}
    >
      <ThemedText type="headlineSmall" style={styles.title}>Weekly Leaderboard</ThemedText>
      <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.subtitle}>
        Europe/Amsterdam
      </ThemedText>
      {ENABLE_COMPETITIVE_DEPTH ? (
        <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.subtitle}>
          Season Mode Enabled
        </ThemedText>
      ) : null}

      {error ? (
        <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff8a80">{error}</ThemedText>
      ) : null}

      {entries.length === 0 && !error ? (
        <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
          No ranked activity this week yet.
        </ThemedText>
      ) : null}

      {entries.map((entry) => {
        const isCurrentUser = user?.id === entry.userId;
        return (
          <Card
            key={entry.userId}
            style={[
              styles.row,
              isCurrentUser && styles.currentUserRow,
            ]}
            mode="outlined"
          >
            <View style={styles.rowContent}>
              <ThemedText type="titleMedium" style={styles.rankText}>#{entry.rank}</ThemedText>
              <View style={styles.userBlock}>
                <ThemedText type="titleMedium">
                  {entry.displayName || `${entry.userId.slice(0, 8)}...`}
                </ThemedText>
                <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
                  {entry.wins}W / {entry.losses}L
                </ThemedText>
                {ENABLE_COMPETITIVE_DEPTH && entry.tier ? (
                  <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
                    Tier: {entry.tier.toUpperCase()}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="titleLarge" style={styles.ratingText}>{entry.rating}</ThemedText>
            </View>
          </Card>
        );
      })}
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
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 8,
  },
  row: {
    borderRadius: 10,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  rankText: {
    width: 42,
  },
  userBlock: {
    flex: 1,
  },
  ratingText: {
    color: '#FF6B00',
  },
  currentUserRow: {
    borderColor: '#FF6B00',
    borderWidth: 2,
  },
});
