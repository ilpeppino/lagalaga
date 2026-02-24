import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import {
  DEFAULT_SESSION_SETTINGS,
  type SessionSettings,
  loadSessionSettings,
  saveSessionSettings,
} from '@/src/lib/sessionSettings';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { settingsTypography, spacing } from '@/src/components/settings/tokens';

const MIN_HOURS = 0;
const MAX_HOURS = 48;

function clampHours(value: number): number {
  if (value < MIN_HOURS) return MIN_HOURS;
  if (value > MAX_HOURS) return MAX_HOURS;
  return value;
}

function NumberSettingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <ThemedText type="bodyMedium" style={styles.settingLabel}>
        {label}
      </ThemedText>

      <View style={styles.pickerWrap}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onChange(clampHours(value - 1))}
          style={styles.pickerButton}
        >
          <ThemedText type="titleMedium" lightColor="#fff" darkColor="#fff">-</ThemedText>
        </TouchableOpacity>
        <ThemedText type="titleMedium" style={styles.valueText}>
          {value}h
        </ThemedText>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onChange(clampHours(value + 1))}
          style={styles.pickerButton}
        >
          <ThemedText type="titleMedium" lightColor="#fff" darkColor="#fff">+</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const { handleError } = useErrorHandler();
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SESSION_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const loaded = await loadSessionSettings();
      setSettings(loaded);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to load settings' });
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateSetting = useCallback(async (nextPartial: Partial<SessionSettings>) => {
    try {
      const next = await saveSessionSettings(nextPartial);
      setSettings(next);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to save settings' });
    }
  }, [handleError]);

  const sectionLabelColor = colorScheme === 'dark' ? '#9a9aa3' : '#6e6e73';

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />

      {isLoading ? (
        <View style={styles.centered}>
          <LagaLoadingSpinner size={56} label="Loading settings..." />
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' }]}>
          <ThemedText type="titleLarge" style={[styles.sectionTitle, { color: sectionLabelColor }]}>
            Sessions
          </ThemedText>

          <NumberSettingRow
            label="Auto-complete live sessions after"
            value={settings.autoCompleteLiveAfterHours}
            onChange={(nextValue) => {
              setSettings((prev) => ({ ...prev, autoCompleteLiveAfterHours: nextValue }));
              void updateSetting({ autoCompleteLiveAfterHours: nextValue });
            }}
          />

          <NumberSettingRow
            label="Auto-hide completed sessions after"
            value={settings.autoHideCompletedAfterHours}
            onChange={(nextValue) => {
              setSettings((prev) => ({ ...prev, autoHideCompletedAfterHours: nextValue }));
              void updateSetting({ autoHideCompletedAfterHours: nextValue });
            }}
          />

          <NumberSettingRow
            label="Starting soon window"
            value={settings.startingSoonWindowHours}
            onChange={(nextValue) => {
              setSettings((prev) => ({ ...prev, startingSoonWindowHours: nextValue }));
              void updateSetting({ startingSoonWindowHours: nextValue });
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: {
    ...settingsTypography.sectionLabel,
    marginBottom: spacing.sm,
  },
  settingRow: {
    minHeight: 50,
    gap: spacing.sm,
  },
  settingLabel: {
    ...settingsTypography.rowText,
  },
  pickerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.md,
  },
  pickerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
  },
  valueText: {
    ...settingsTypography.rowText,
    minWidth: 44,
    textAlign: 'center',
  },
});
