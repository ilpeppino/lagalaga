import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AnimatedButton } from '@/components/ui/paper';

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
      icon={() => <MaterialIcons name="sports-esports" size={20} color="#ffffff" />}
    />
  );
}

const labelStyle: TextStyle = {
  fontSize: 16,
  fontWeight: '600',
};
