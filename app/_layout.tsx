import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
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
import { extractInviteCodeFromUrl } from '@/src/lib/deepLinking';
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
  const router = useRouter();
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
    // Handle HTTPS App Link invite URLs (Android App Links).
    // Custom scheme URLs (lagalaga://invite/CODE) are routed automatically by Expo Router.
    const handleHttpsInviteUrl = (url: string) => {
      if (!url.startsWith('https://')) return;
      const code = extractInviteCodeFromUrl(url);
      if (code) {
        logger.info('App opened via HTTPS App Link invite', { urlType: 'https-app-link' });
        router.replace(`/invite/${code}` as any);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        logger.info('App opened with initial URL', { urlType: url.startsWith('https') ? 'https' : 'scheme' });
        handleHttpsInviteUrl(url);
      }
    });

    // Also handle HTTPS App Links received while the app is running
    const subscription = Linking.addEventListener('url', (event) => {
      logger.info('Deep link received', { urlType: event.url.startsWith('https') ? 'https' : 'scheme' });
      handleHttpsInviteUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

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
