/**
 * Reusable error fallback UI.
 * Shows error message, retry button, and optional navigation.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}

        {showGoHome && (
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.homeButtonText}>Go Home</Text>
          </TouchableOpacity>
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
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  homeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  homeButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
