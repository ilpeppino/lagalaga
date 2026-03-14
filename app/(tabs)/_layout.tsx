import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { TouchableOpacity } from 'react-native';

import * as Linking from "expo-linking";

import { HapticTab } from '@/components/haptic-tab';
import { AppHeaderTitle } from '@/components/navigation/AppHeaderTitle';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logger } from '@/src/lib/logger';


export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
  const sub = Linking.addEventListener("url", ({ url }) => {
    // Log only the URL scheme/path without query parameters to avoid exposing OAuth codes/state tokens
    const scheme = url.split('?')[0];
    logger.debug('[LINKING] url event received', { scheme });
  });

  Linking.getInitialURL().then((url) => {
    if (url) {
      // Log only the URL scheme/path without query parameters to avoid exposing OAuth codes/state tokens
      const scheme = url.split('?')[0];
      logger.debug('[LINKING] initial url received', { scheme });
    }
  });

  return () => sub.remove();
}, []);

  const UserIconButton = () => (
    <TouchableOpacity
      onPress={() => router.push('/me')}
      style={{ marginRight: 16 }}
    >
      <IconSymbol
        name="person.circle.fill"
        size={28}
        color={Colors[colorScheme ?? 'light'].tint}
      />
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        tabBarButton: HapticTab,
        headerRight: () => <UserIconButton />,
        headerTitle: ({ children }) => (
          <AppHeaderTitle title={typeof children === 'string' ? children : ''} />
        ),
        headerTitleAlign: 'center',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
