import { StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settingsTypography, spacing } from './tokens';

interface StatusIndicatorProps {
  label: string;
}

export function StatusIndicator({ label }: StatusIndicatorProps) {
  const colorScheme = useColorScheme();
  const dotColor = colorScheme === 'dark' ? '#4aa369' : '#2f9e54';
  const textColor = colorScheme === 'dark' ? '#9eb5a6' : '#2f7a4c';

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    ...settingsTypography.secondaryText,
  },
});
