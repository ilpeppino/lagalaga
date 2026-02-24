import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settingsTypography, spacing } from './tokens';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
  elevated?: boolean;
  tone?: 'default' | 'danger';
}

export function SettingsSection({ title, children, elevated = false, tone = 'default' }: SettingsSectionProps) {
  const colorScheme = useColorScheme();
  const titleColor = tone === 'danger'
    ? (colorScheme === 'dark' ? '#b77a7a' : '#9c5050')
    : (colorScheme === 'dark' ? '#9a9aa3' : '#6e6e73');
  const surfaceColor = colorScheme === 'dark' ? '#17181c' : '#f7f7fa';
  const borderColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(20,20,25,0.06)';

  return (
    <View
      style={[
        styles.section,
        elevated
          ? {
              backgroundColor: surfaceColor,
              borderColor,
              borderWidth: StyleSheet.hairlineWidth,
              shadowColor: '#000',
              shadowOpacity: colorScheme === 'dark' ? 0.24 : 0.08,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }
          : null,
      ]}
    >
      <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
      <View style={styles.rows}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 14,
    padding: spacing.md,
  },
  rows: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  title: {
    ...settingsTypography.sectionLabel,
  },
});
