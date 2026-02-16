/**
 * User Profile Screen - Stats and Achievements
 */

import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { useErrorHandler } from '@/hooks/useErrorHandler';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const { handleError } = useErrorHandler();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<{
    sessionsHosted: number;
    sessionsJoined: number;
    streakDays: number;
  } | null>(null);
  const [achievements, setAchievements] = useState<Array<{ code: string; unlockedAt: string }>>([]);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await sessionsAPIStoreV2.getUserStats();
        setStats(data.stats ? {
          sessionsHosted: data.stats.sessionsHosted,
          sessionsJoined: data.stats.sessionsJoined,
          streakDays: data.stats.streakDays,
        } : null);
        setAchievements(data.achievements);
      } catch (error) {
        handleError(error, { fallbackMessage: 'Failed to load user stats' });
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, [handleError]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText type="bodyLarge" style={styles.loadingText}>
          Loading profile...
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}
      contentContainerStyle={styles.content}
    >
      <ThemedView style={styles.section}>
        <ThemedText type="titleLarge" style={styles.sectionTitle}>
          Statistics
        </ThemedText>
        <View style={styles.statsGrid}>
          <View style={[
            styles.statCard,
            { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f9fa' }
          ]}>
            <ThemedText type="headlineMedium">{stats?.sessionsHosted ?? 0}</ThemedText>
            <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
              Sessions Hosted
            </ThemedText>
          </View>
          <View style={[
            styles.statCard,
            { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f9fa' }
          ]}>
            <ThemedText type="headlineMedium">{stats?.sessionsJoined ?? 0}</ThemedText>
            <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
              Sessions Joined
            </ThemedText>
          </View>
          <View style={[
            styles.statCard,
            { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f9fa' }
          ]}>
            <ThemedText type="headlineMedium">{stats?.streakDays ?? 0}</ThemedText>
            <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
              Day Streak
            </ThemedText>
          </View>
        </View>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="titleLarge" style={styles.sectionTitle}>
          Achievements
        </ThemedText>
        {achievements.length === 0 ? (
          <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
            No achievements unlocked yet. Create or join a session to get started!
          </ThemedText>
        ) : (
          <View style={styles.achievementsList}>
            {achievements.map((achievement) => (
              <View
                key={achievement.code}
                style={[
                  styles.achievementBadge,
                  { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f9fa' }
                ]}
              >
                <ThemedText type="titleMedium">
                  {achievement.code === 'FIRST_HOST' ? '🎯 First Host' :
                   achievement.code === 'FIRST_JOIN' ? '🎉 First Join' :
                   achievement.code}
                </ThemedText>
                <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
                  Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  achievementsList: {
    gap: 12,
  },
  achievementBadge: {
    padding: 16,
    borderRadius: 12,
  },
});
