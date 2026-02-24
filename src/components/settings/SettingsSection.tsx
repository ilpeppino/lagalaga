import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settingsTypography, spacing } from './tokens';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
  elevated?: boolean;
}

export function SettingsSection({ title, children, elevated = false }: SettingsSectionProps) {
  const colorScheme = useColorScheme();
  const titleColor = colorScheme === 'dark' ? '#f2f2f5' : '#1b1b1f';
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
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.md,
  },
  title: {
    ...settingsTypography.sectionHeader,
  },
});
