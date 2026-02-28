import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="connect-roblox" />
      {/* Roblox OAuth redirect target (see backend ROBLOX_REDIRECT_URI). */}
      <Stack.Screen name="roblox" />
      {/* Google OAuth redirect target (see backend GOOGLE_REDIRECT_URI). */}
      <Stack.Screen name="google" />
    </Stack>
  );
}
