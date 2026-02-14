import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { TouchableOpacity } from 'react-native';

import * as Linking from "expo-linking";

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';


export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
  const sub = Linking.addEventListener("url", ({ url }) => {
    console.log("[LINKING] url event:", url);
  });

  Linking.getInitialURL().then((url) => {
    console.log("[LINKING] initial url:", url);
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
