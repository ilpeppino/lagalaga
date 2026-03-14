import { Stack } from 'expo-router';
import { AppHeaderTitle } from '@/components/navigation/AppHeaderTitle';

export default function InviteLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: ({ children }) => (
          <AppHeaderTitle title={typeof children === 'string' ? children : ''} />
        ),
        headerTitleAlign: 'center',
      }}
    >
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
