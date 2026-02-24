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
    ? (colorScheme === 'dark' ? '#c67a7a' : '#b85d5d')
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
        android_ripple={{ color: colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
        style={({ pressed }) => [styles.pressable, onPress && pressed ? styles.pressed : null]}
      >
        <Text style={[styles.label, destructive ? styles.destructiveLabel : null, { color: textColor }]}>{label}</Text>
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
    minHeight: 50,
    justifyContent: 'center',
  },
  pressable: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...settingsTypography.rowText,
  },
  destructiveLabel: {
    ...settingsTypography.dangerText,
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
