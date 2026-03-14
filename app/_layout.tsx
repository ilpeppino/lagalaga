import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import 'react-native-reanimated';
import * as Linking from 'expo-linking';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppThemeProvider } from '@/contexts/AppThemeContext';
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
import { setRobloxNotConnectedHandler, setAuthFailureHandler } from '@/src/lib/api';
import { handleRobloxNotConnectedError } from '@/src/lib/robloxGateController';
import { shouldRequireRobloxConnection } from '@/src/features/auth/robloxConnectionGate';
import { AppHeaderTitle } from '@/components/navigation/AppHeaderTitle';

export const unstable_settings = {
  anchor: 'index',
};

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore: can throw if called multiple times during Fast Refresh.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'BitcountSingle-Regular': require('@/assets/fonts/BitcountSingle-Regular.ttf'),
    'BitcountSingle-Bold': require('@/assets/fonts/BitcountSingle-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary level="screen">
        <AppThemeProvider>
          <ThemedAppShell />
        </AppThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

/**
 * Inner shell rendered inside AppThemeProvider so useColorScheme() reads the
 * user's forced theme preference rather than only the system value.
 */
function ThemedAppShell() {
  const colorScheme = useColorScheme();
  const paperTheme = colorScheme === 'dark' ? DarkPaperTheme : LightPaperTheme;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Handle HTTPS App Link invite URLs (Android App Links).
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
        logger.info('App opened with initial URL', {
          urlType: url.startsWith('https') ? 'https' : 'scheme',
        });
        handleHttpsInviteUrl(url);
      }
    });

    const subscription = Linking.addEventListener('url', (event) => {
      logger.info('Deep link received', {
        urlType: event.url.startsWith('https') ? 'https' : 'scheme',
      });
      handleHttpsInviteUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    setRobloxNotConnectedHandler(() => {
      handleRobloxNotConnectedError('ROBLOX_NOT_CONNECTED', pathname, (path) => {
        router.replace(path as '/me');
      });
    });

    return () => {
      setRobloxNotConnectedHandler(null);
    };
  }, [pathname, router]);

  useEffect(() => {
    configureNotificationHandler();
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  return (
    <AuthProvider>
      <AuthFailureBridge />
      <FavoritesForegroundRefreshBridge />
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack
            screenOptions={{
              headerTitle: ({ children }) => (
                <AppHeaderTitle title={typeof children === 'string' ? children : ''} />
              ),
              headerTitleAlign: 'center',
            }}
          >
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
            {/* Me screen controls its own header (floating back arrow, no title bar) */}
            <Stack.Screen name="me" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
            <Stack.Screen name="account/delete" options={{ headerShown: true, title: 'Delete Account' }} />
            <Stack.Screen name="account/delete-confirm" options={{ headerShown: true, title: 'Confirm Deletion' }} />
            <Stack.Screen name="account/delete-done" options={{ headerShown: true, title: 'Deletion Requested' }} />
            <Stack.Screen name="safety-report" options={{ headerShown: true, title: 'Safety & Report' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="invites" options={{ headerShown: false }} />
            <Stack.Screen name="invite" options={{ headerShown: false }} />
            {ENABLE_COMPETITIVE_DEPTH ? (
              <Stack.Screen
                name="match-history"
                options={{ headerShown: true, title: 'Match History' }}
              />
            ) : null}
          </Stack>
          <RobloxLinkingGuard />
        </ThemeProvider>
      </PaperProvider>
    </AuthProvider>
  );
}

function AuthFailureBridge() {
  const { signOut } = useAuth();
  useEffect(() => {
    setAuthFailureHandler(() => {
      signOut().catch(() => {});
    });
    return () => {
      setAuthFailureHandler(null);
    };
  }, [signOut]);
  return null;
}

function FavoritesForegroundRefreshBridge() {
  const { user } = useAuth();
  useFavoritesForegroundRefresh(user?.id);
  return null;
}

function RobloxLinkingGuard() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!shouldRequireRobloxConnection(user)) return;

    const allowed =
      pathname === '/auth/connect-roblox' ||
      pathname === '/auth/roblox' ||
      pathname === '/auth/sign-in';

    if (!allowed) {
      logger.info('Roblox linking guard redirecting to connect screen', {
        pathname,
        reason: 'roblox_not_connected',
      });
      router.replace('/auth/connect-roblox');
      return;
    }
    logger.info('Roblox linking guard allowed route while Roblox is not connected', {
      pathname,
      reason: 'allowed_connect_flow_route',
    });
  }, [loading, pathname, router, user]);

  return null;
}
