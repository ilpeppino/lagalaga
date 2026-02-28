import { StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { StyleProp, ViewStyle } from 'react-native';

// Renders the native Apple Sign-In button (ASAuthorizationAppleIDButton).
// Using the native component is required for App Store compliance —
// Apple does not allow custom-styled buttons that embed the Apple logo.

interface AppleSignInButtonProps {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppleSignInButton({
  onPress,
  disabled,
  loading,
  style,
}: AppleSignInButtonProps) {
  const colorScheme = useColorScheme();
  const isDisabled = disabled || loading;

  return (
    <View style={[styles.container, isDisabled && styles.disabled, style]}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          colorScheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={8}
        style={styles.button}
        onPress={() => {
          if (isDisabled) return;
          onPress();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    opacity: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  button: {
    width: '100%',
    height: 52,
  },
});
