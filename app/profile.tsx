/**
 * User Profile Screen - Stats and Achievements
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { SettingsRow } from '@/src/components/settings/SettingsRow';
import { SettingsSection } from '@/src/components/settings/SettingsSection';
import { settingsTypography, spacing } from '@/src/components/settings/tokens';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<{
    sessionsHosted: number;
    sessionsJoined: number;
    streakDays: number;
  } | null>(null);
  const [achievements, setAchievements] = useState<{ code: string; unlockedAt: string }[]>([]);

  const openSafetyReport = () => {
    router.push('/safety-report');
  };

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await sessionsAPIStoreV2.getUserStats();
        setStats(
          data.stats
            ? {
                sessionsHosted: data.stats.sessionsHosted,
                sessionsJoined: data.stats.sessionsJoined,
                streakDays: data.stats.streakDays,
              }
            : null
        );
        setAchievements(data.achievements);
      } catch (error) {
        handleError(error, { fallbackMessage: 'Failed to load user stats' });
      } finally {
        setIsLoading(false);
      }
    }

    void loadStats();
  }, [handleError]);

  const backgroundColor = colorScheme === 'dark' ? '#050507' : '#fff';
  const secondaryTextColor = colorScheme === 'dark' ? '#94949d' : '#6e6e73';

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor }]}>
        <Stack.Screen options={{ title: 'Profile', headerShown: true }} />
        <LagaLoadingSpinner size={56} label="Loading profile..." />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: 'Profile', headerShown: true }} />

      <SettingsSection title="Statistics" elevated>
        <SettingsRow
          label="Sessions Hosted"
          hideChevron
          rightContent={<Text style={[styles.rowValue, { color: secondaryTextColor }]}>{stats?.sessionsHosted ?? 0}</Text>}
        />
        <SettingsRow
          label="Sessions Joined"
          hideChevron
          rightContent={<Text style={[styles.rowValue, { color: secondaryTextColor }]}>{stats?.sessionsJoined ?? 0}</Text>}
        />
        <SettingsRow
          label="Day Streak"
          hideChevron
          rightContent={<Text style={[styles.rowValue, { color: secondaryTextColor }]}>{stats?.streakDays ?? 0}</Text>}
        />
      </SettingsSection>

      <View style={styles.sectionGap}>
        <SettingsSection title="Achievements" elevated>
          {achievements.length === 0 ? (
            <Text style={[styles.emptyText, { color: secondaryTextColor }]}>
              No achievements unlocked yet.
            </Text>
          ) : (
            achievements.map((achievement) => (
              <SettingsRow
                key={`${achievement.code}-${achievement.unlockedAt}`}
                label={
                  achievement.code === 'FIRST_HOST'
                    ? 'First Host'
                    : achievement.code === 'FIRST_JOIN'
                      ? 'First Join'
                      : achievement.code
                }
                hideChevron
                rightContent={
                  <Text style={[styles.achievementDate, { color: secondaryTextColor }]}>
                    {new Date(achievement.unlockedAt).toLocaleDateString()}
                  </Text>
                }
              />
            ))
          )}
        </SettingsSection>
      </View>

      <View style={styles.sectionGap}>
        <SettingsSection title="Account">
          <SettingsRow label="Safety & Report" onPress={openSafetyReport} />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionGap: {
    marginTop: spacing.lg,
  },
  rowValue: {
    ...settingsTypography.secondaryText,
  },
  achievementDate: {
    ...settingsTypography.caption,
  },
  emptyText: {
    ...settingsTypography.secondaryText,
  },
});
