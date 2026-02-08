import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      {/* Roblox OAuth redirect target (see backend ROBLOX_REDIRECT_URI). */}
      <Stack.Screen name="roblox" />
    </Stack>
  );
}
