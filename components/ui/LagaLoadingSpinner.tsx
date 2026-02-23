import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

type LagaLoadingSpinnerProps = {
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function LagaLoadingSpinner({
  size = 64,
  label,
  style,
  accessibilityLabel = 'Loading',
}: LagaLoadingSpinnerProps) {
  const colorScheme = useColorScheme();
  const spin = useRef(new Animated.Value(0)).current;
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      spin.stopAnimation();
    };
  }, [spin]);

  const spinTransform = useMemo(
    () => ({
      transform: [
        {
          rotate: spin.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    }),
    [spin]
  );

  const logoChipStyle = colorScheme === 'dark'
    ? styles.logoChipDark
    : styles.logoChipLight;

  const chipPadding = Math.max(6, Math.round(size * 0.18));
  const labelText = label?.trim();

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      <Animated.View style={[styles.logoChipBase, logoChipStyle, { padding: chipPadding }, spinTransform]}>
        {logoFailed ? (
          <View style={[styles.fallbackCircle, { width: size, height: size, borderRadius: size / 2 }]}>
            <ThemedText type="titleLarge" lightColor="#1f6bff" darkColor="#64a1ff">L</ThemedText>
          </View>
        ) : (
          <Image
            source={require('@/assets/generated/icon-256.png')}
            style={{ width: size, height: size, borderRadius: Math.round(size * 0.2) }}
            resizeMode="contain"
            onError={() => setLogoFailed(true)}
          />
        )}
      </Animated.View>
      {labelText ? (
        <ThemedText type="bodyLarge" style={styles.label} lightColor="#666" darkColor="#aaa">
          {labelText}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoChipBase: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  logoChipLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  logoChipDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  fallbackCircle: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 14,
    textAlign: 'center',
  },
});
