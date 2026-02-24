import { ReactNode, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settingsTypography, spacing } from './tokens';

interface SettingsRowProps {
  label: string;
  onPress?: () => void;
  rightContent?: ReactNode;
  hideChevron?: boolean;
  destructive?: boolean;
}

export function SettingsRow({
  label,
  onPress,
  rightContent,
  hideChevron = false,
  destructive = false,
}: SettingsRowProps) {
  const colorScheme = useColorScheme();
  const textColor = destructive
    ? (colorScheme === 'dark' ? '#db6b6b' : '#c62828')
    : (colorScheme === 'dark' ? '#f2f2f5' : '#1b1b1f');
  const secondaryTextColor = colorScheme === 'dark' ? '#94949d' : '#6e6e73';
  const rowScale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.timing(rowScale, {
      toValue,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: rowScale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        style={styles.pressable}
      >
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        <View style={styles.rightSide}>
          {rightContent}
          {!hideChevron && onPress ? (
            <IconSymbol name="chevron.right" size={16} color={secondaryTextColor} />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: 48,
    justifyContent: 'center',
  },
  pressable: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  label: {
    ...settingsTypography.rowText,
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
