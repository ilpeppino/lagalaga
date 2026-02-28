import { View, Text, StyleSheet } from 'react-native';
import { AnimatedButton } from '@/components/ui/paper';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

// TODO: Branding compliance — replace with the official Roblox logo mark.
//   1. Download the official Roblox logo (white mark on transparent) from:
//      https://corp.roblox.com/brand-guidelines/
//   2. Save as: assets/images/roblox-logo-white.png
//   3. Replace <RobloxLogoMark /> below with:
//      <Image
//        source={require('@/assets/images/roblox-logo-white.png')}
//        style={{ width: 20, height: 20 }}
//        resizeMode="contain"
//        accessibilityIgnoresInvertColors
//      />
function RobloxLogoMark() {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLetter} allowFontScaling={false}>
        R
      </Text>
    </View>
  );
}

interface RobloxSignInButtonProps {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function RobloxSignInButton({
  onPress,
  disabled,
  loading,
  style,
  contentStyle,
}: RobloxSignInButtonProps) {
  return (
    <AnimatedButton
      title="Continue with Roblox"
      variant="filled"
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      enableHaptics
      buttonColor="#000000"
      textColor="#ffffff"
      style={style}
      contentStyle={[{ minHeight: 52 }, contentStyle]}
      labelStyle={labelStyle}
      accessibilityLabel="Continue with Roblox"
      icon={() => <RobloxLogoMark />}
    />
  );
}

const labelStyle: TextStyle = {
  fontSize: 16,
  fontWeight: '600',
};

const styles = StyleSheet.create({
  badge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#e31a00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLetter: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
});
