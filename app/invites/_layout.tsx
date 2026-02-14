import { Stack } from 'expo-router';

export default function InvitesLayout() {
  return (
    <Stack>
      <Stack.Screen name="[sessionId]" options={{ title: 'Session Invite' }} />
    </Stack>
  );
}
