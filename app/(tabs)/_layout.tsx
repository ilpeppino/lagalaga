import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View, TouchableOpacity } from 'react-native';

import * as Linking from "expo-linking";

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logger } from '@/src/lib/logger';


export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      logger.debug('Deep link url event', { url });
    });

    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          logger.debug('Deep link initial url', { url });
        }
      })
      .catch((error) => {
        logger.error('Failed to get initial URL in tabs layout', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => sub.remove();
  }, []);

  const UserIconButton = () => (
    <TouchableOpacity
      onPress={() => router.push('/me')}
      style={{ marginRight: 12 }}
    >
      <IconSymbol
        name="person.circle.fill"
        size={28}
        color={Colors[colorScheme ?? 'light'].tint}
      />
    </TouchableOpacity>
  );

  const NotificationsButton = () => (
    <TouchableOpacity
      onPress={() => router.push('/notifications')}
      style={{ marginRight: 12 }}
    >
      <IconSymbol
        name="bell.fill"
        size={24}
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
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <NotificationsButton />
            <UserIconButton />
          </View>
        ),
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
