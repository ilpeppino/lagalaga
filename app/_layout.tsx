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
import { AuthProvider } from '@/src/features/auth/useAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { logger } from '@/src/lib/logger';
import { DarkPaperTheme, LightPaperTheme } from '@/constants/paperTheme';

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

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary level="screen">
        <AuthProvider>
          <PaperProvider theme={paperTheme}>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="sessions" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </PaperProvider>
        </AuthProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
