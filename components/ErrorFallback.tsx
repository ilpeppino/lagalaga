/**
 * Reusable error fallback UI.
 * Shows error message, retry button, and optional navigation.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/paper';
import { useRouter } from 'expo-router';

interface ErrorFallbackProps {
  /** Short title for the error. */
  title?: string;
  /** More detailed message. */
  message?: string;
  /** Called when user taps Retry. If omitted, retry button is hidden. */
  onRetry?: () => void;
  /** Whether to show a "Go Home" button. */
  showGoHome?: boolean;
  /** Level affects sizing: 'screen' fills the viewport, 'section' is compact. */
  level?: 'screen' | 'section';
}

export function ErrorFallback({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
  showGoHome = false,
  level = 'screen',
}: ErrorFallbackProps) {
  const router = useRouter();

  return (
    <View style={[styles.container, level === 'section' && styles.containerSection]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      <View style={styles.actions}>
        {onRetry && (
          <Button
            title="Try Again"
            variant="filled"
            onPress={onRetry}
            style={styles.retryButton}
            contentStyle={styles.retryButtonContent}
            labelStyle={styles.retryButtonText}
          />
        )}

        {showGoHome && (
          <Button
            title="Go Home"
            variant="text"
            onPress={() => router.replace('/')}
            style={styles.homeButton}
            labelStyle={styles.homeButtonText}
            textColor="#007AFF"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  containerSection: {
    flex: 0,
    paddingVertical: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  actions: {
    gap: 12,
    alignItems: 'center',
  },
  retryButton: {
    alignSelf: 'stretch',
    minWidth: 180,
  },
  retryButtonContent: {
    paddingHorizontal: 20,
    minHeight: 48,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  homeButton: {
    alignSelf: 'center',
  },
  homeButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
