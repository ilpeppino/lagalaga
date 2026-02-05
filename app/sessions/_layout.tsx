import { Stack } from "expo-router";

export default function SessionsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Sessions" }} />
      <Stack.Screen name="create" options={{ title: "Create Session" }} />
      <Stack.Screen name="[id]" options={{ title: "Session Details" }} />
    </Stack>
  );
}
