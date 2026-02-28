import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';

// Google Sign-In button styled per Google's branding guidelines for OAuth web flows.
// Uses expo-web-browser under the hood (not the native Google Sign-In SDK).
// The Ionicons logo-google icon is the closest available approximation without adding
// @react-native-google-signin/google-signin, which would provide the official native button.
// If you switch to the native Google Sign-In SDK, replace this component with
// GoogleSignin.hasPlayServices() + the native <GoogleSigninButton />.

interface GoogleSignInButtonProps {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GoogleSignInButton({
  onPress,
  disabled,
  loading,
  style,
}: GoogleSignInButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[styles.button, isDisabled && styles.buttonDisabled, style]}
      accessibilityLabel="Sign in with Google"
      accessibilityRole="button"
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size={18} color="#4285F4" />
        ) : (
          <Ionicons name="logo-google" size={18} color="#4285F4" />
        )}
        <Text style={styles.label} allowFontScaling={false}>
          Sign in with Google
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dadce0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '500',
  },
});
