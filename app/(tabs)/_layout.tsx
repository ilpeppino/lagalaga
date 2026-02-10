import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';

import * as Linking from "expo-linking";

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';


export default function TabLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
  const sub = Linking.addEventListener("url", ({ url }) => {
    console.log("[LINKING] url event:", url);
  });

  Linking.getInitialURL().then((url) => {
    console.log("[LINKING] initial url:", url);
  });

  return () => sub.remove();
}, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
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
