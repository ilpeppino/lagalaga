import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TextInput } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSessionPalette, spacing } from './createSessionTokens';

interface SessionTitleFieldProps {
  title: string;
  onChangeTitle: (value: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export function SessionTitleField({
  title,
  onChangeTitle,
  onFocus,
  disabled = false,
}: SessionTitleFieldProps) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? createSessionPalette.dark : createSessionPalette.light;

  return (
    <View>
      <ThemedText type="titleSmall" lightColor={palette.textTertiary} darkColor={palette.textTertiary} style={styles.label}>
        Session title
      </ThemedText>
      <TextInput
        value={title}
        onChangeText={onChangeTitle}
        onFocus={onFocus}
        placeholder="Add a title"
        placeholderTextColor={palette.placeholder}
        maxLength={100}
        editable={!disabled}
        style={styles.input}
        contentStyle={styles.inputContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    borderRadius: 12,
  },
  inputContent: {
    fontSize: 16,
  },
});
