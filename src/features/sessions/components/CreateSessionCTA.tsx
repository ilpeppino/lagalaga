import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedButton as Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSessionPalette, spacing } from './createSessionTokens';

interface CreateSessionCTAProps {
  hasGameSelected: boolean;
  isCreating: boolean;
  onPress: () => void;
}

export function CreateSessionCTA({
  hasGameSelected,
  isCreating,
  onPress,
}: CreateSessionCTAProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? createSessionPalette.dark : createSessionPalette.light;
  const visibleProgress = useSharedValue(hasGameSelected ? 1 : 0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    visibleProgress.value = withTiming(hasGameSelected ? 1 : 0, { duration: 180 });
  }, [hasGameSelected, visibleProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(visibleProgress.value, [0, 1], [0.65, 1]),
    transform: [{ translateY: interpolate(visibleProgress.value, [0, 1], [6, 0]) }],
    shadowOpacity: interpolate(pressProgress.value, [0, 1], [0.24, 0.36]),
    shadowRadius: interpolate(pressProgress.value, [0, 1], [10, 16]),
    elevation: interpolate(pressProgress.value, [0, 1], [5, 9]),
  }));

  const disabled = isCreating || !hasGameSelected;

  return (
    <Animated.View style={[styles.wrapper, animatedStyle, { shadowColor: '#0d6ddd' }]}>
      <Button
        title={isCreating ? 'Creating Session...' : 'Create session'}
        variant="filled"
        buttonColor={disabled ? palette.ctaDisabled : palette.accent}
        textColor={disabled ? palette.ctaDisabledText : '#fff'}
        style={styles.button}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        onPress={onPress}
        loading={isCreating}
        disabled={disabled}
        onPressIn={() => {
          pressProgress.value = withTiming(1, { duration: 110 });
        }}
        onPressOut={() => {
          pressProgress.value = withTiming(0, { duration: 120 });
        }}
        enableHaptics
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: spacing.md,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  button: {
    borderRadius: 14,
  },
  buttonContent: {
    minHeight: 56,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'none',
  },
});
