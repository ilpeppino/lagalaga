import { Stack } from 'expo-router';
import { AppHeaderTitle } from '@/components/navigation/AppHeaderTitle';

export default function InvitesLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: ({ children }) => (
          <AppHeaderTitle title={typeof children === 'string' ? children : ''} />
        ),
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen name="[sessionId]" options={{ title: 'Session Invite' }} />
    </Stack>
  );
}
