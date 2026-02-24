import { StyleSheet, View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import type { SessionVisibility } from '@/src/features/sessions/types-v2';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSessionPalette, spacing } from './createSessionTokens';

const visibilityOptions: { value: SessionVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'invite_only', label: 'Invite' },
];

interface VisibilitySelectorProps {
  visibility: SessionVisibility;
  isRanked: boolean;
  isCreating: boolean;
  onChangeVisibility: (value: SessionVisibility) => void;
}

export function VisibilitySelector({
  visibility,
  isRanked,
  isCreating,
  onChangeVisibility,
}: VisibilitySelectorProps) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? createSessionPalette.dark : createSessionPalette.light;

  return (
    <View>
      <ThemedText type="titleSmall" lightColor={palette.textTertiary} darkColor={palette.textTertiary} style={styles.copyLabel}>
        Who can join?
      </ThemedText>
      <SegmentedButtons
        value={visibility}
        onValueChange={(value) => {
          onChangeVisibility(value as SessionVisibility);
        }}
        density="small"
        buttons={visibilityOptions.map((option) => ({
          value: option.value,
          label: option.label,
          disabled: isCreating || (isRanked && option.value !== 'public'),
          checkedColor: palette.textPrimary,
          uncheckedColor: palette.textSecondary,
          style: {
            borderWidth: 1,
            borderColor: palette.borderTint,
            backgroundColor: option.value === visibility ? palette.surfaceRaised : palette.surface,
          },
        }))}
        style={styles.segmentedControl}
      />
      {isRanked && (
        <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary} style={styles.helper}>
          Ranked sessions are always public.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  copyLabel: {
    marginBottom: spacing.sm,
    fontSize: 14,
    fontWeight: '500',
  },
  segmentedControl: {
    borderRadius: 12,
  },
  helper: {
    marginTop: spacing.xs,
    fontSize: 12,
  },
});
