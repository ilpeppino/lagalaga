import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import * as Linking from 'expo-linking';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/src/features/auth/useAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { logger } from '@/src/lib/logger';
import { DarkPaperTheme, LightPaperTheme } from '@/constants/paperTheme';
import { useFavoritesForegroundRefresh } from '@/src/features/favorites/useFavoritesForegroundRefresh';
import { ENABLE_COMPETITIVE_DEPTH } from '@/src/lib/runtimeConfig';
import {
  configureNotificationHandler,
  setupNotificationListeners,
} from '@/src/features/notifications/notificationHandlers';

export const unstable_settings = {
  anchor: 'index',
};

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore: can throw if called multiple times during Fast Refresh.
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const paperTheme = colorScheme === 'dark' ? DarkPaperTheme : LightPaperTheme;
  const [fontsLoaded, fontError] = useFonts({
    'BitcountSingle-Regular': require('@/assets/fonts/BitcountSingle-Regular.ttf'),
    'BitcountSingle-Bold': require('@/assets/fonts/BitcountSingle-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Log initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        logger.info('App opened with initial URL', { url });
      }
    });

    // Listen for deep link events while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      logger.info('Deep link received', { url: event.url });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    configureNotificationHandler();
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary level="screen">
        <AuthProvider>
          <FavoritesForegroundRefreshBridge />
          <PaperProvider theme={paperTheme}>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen
                  name="auth"
                  options={{ headerShown: false, animation: 'fade', animationDuration: 180 }}
                />
                <Stack.Screen
                  name="sessions"
                  options={{ headerShown: false, animation: 'slide_from_right', animationDuration: 220 }}
                />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="me" options={{ headerShown: true, title: 'Me' }} />
                <Stack.Screen name="account/delete" options={{ headerShown: true, title: 'Delete Account' }} />
                <Stack.Screen name="account/delete-confirm" options={{ headerShown: true, title: 'Confirm Deletion' }} />
                <Stack.Screen name="account/delete-done" options={{ headerShown: true, title: 'Deletion Requested' }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="invites" options={{ headerShown: false }} />
                {ENABLE_COMPETITIVE_DEPTH ? (
                  <Stack.Screen
                    name="match-history"
                    options={{ headerShown: true, title: 'Match History' }}
                  />
                ) : null}
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </PaperProvider>
        </AuthProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function FavoritesForegroundRefreshBridge() {
  const { user } = useAuth();
  useFavoritesForegroundRefresh(user?.id);
  return null;
}
