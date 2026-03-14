import { Stack } from "expo-router";

/**
 * Sessions stack layout.
 *
 * The index screen (SessionsListScreenV2) renders its own custom header — it
 * handles the avatar, title, and filter control inline so the page feels like
 * one continuous surface. Sign-out lives in the Me / Account flow only.
 */
export default function SessionsLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        animationDuration: 220,
        gestureEnabled: true,
      }}
    >
      {/* headerShown is overridden to true by the screen when selection mode is active */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ title: "Create Session" }} />
      <Stack.Screen name="friend-picker" options={{ title: "Invite Friends" }} />
      <Stack.Screen name="[id]" options={{ title: "Session Details" }} />
      <Stack.Screen name="handoff" options={{ title: "Join Handoff" }} />
    </Stack>
  );
}
