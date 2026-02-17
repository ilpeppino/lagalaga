import { useEffect, useState } from 'react';
import { AccessibilityInfo, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Button, type ButtonProps } from './Button';

export interface AnimatedButtonProps extends ButtonProps {
  containerStyle?: StyleProp<ViewStyle>;
  enableScaleAnimation?: boolean;
  pressScale?: number;
  enableHaptics?: boolean;
}

export function AnimatedButton({
  containerStyle,
  enableScaleAnimation = true,
  pressScale = 0.97,
  enableHaptics = false,
  onPressIn,
  onPressOut,
  ...rest
}: AnimatedButtonProps) {
  const scale = useSharedValue(1);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotionEnabled(enabled);
        }
      })
      .catch(() => {
        if (mounted) {
          setReduceMotionEnabled(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        setReduceMotionEnabled(enabled);
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  function handlePressIn(event: Parameters<NonNullable<ButtonProps['onPressIn']>>[0]) {
    if (!rest.disabled && enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    if (!rest.disabled && enableScaleAnimation && !reduceMotionEnabled) {
      scale.value = withSpring(pressScale, {
        damping: 16,
        stiffness: 220,
        mass: 0.8,
      });
    }

    onPressIn?.(event);
  }

  function handlePressOut(event: Parameters<NonNullable<ButtonProps['onPressOut']>>[0]) {
    if (!rest.disabled && enableScaleAnimation && !reduceMotionEnabled) {
      scale.value = withSpring(1, {
        damping: 16,
        stiffness: 220,
        mass: 0.8,
      });
    }

    onPressOut?.(event);
  }

  return (
    <Animated.View style={[containerStyle, animatedStyle]}>
      <Button {...rest} onPressIn={handlePressIn} onPressOut={handlePressOut} />
    </Animated.View>
  );
}
