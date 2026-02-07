import { Stack } from 'expo-router';

export default function InviteLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="[code]"
        options={{
          title: 'Session Invite',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
