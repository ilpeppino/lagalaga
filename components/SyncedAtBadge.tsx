import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

function formatSyncedAgo(syncedAt: string): string {
  const diffMin = Math.floor((Date.now() - new Date(syncedAt).getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1 min ago';
  return `${diffMin} min ago`;
}

interface SyncedAtBadgeProps {
  /**
   * Section title rendered to the left of the refresh button.
   * When omitted the title row is hidden; only the meta row is shown.
   */
  label?: string;
  /** ISO timestamp of the last successful sync. null = never loaded. */
  syncedAt: string | null;
  isStale?: boolean;
  /**
   * When true the spinner replaces the refresh icon and the meta row
   * shows "Refreshing…" instead of the timestamp.
   */
  isRefreshing?: boolean;
  onRefresh: () => void;
  /**
   * Disables the refresh button (e.g. while a form submission is in flight).
   * The button is always disabled while isRefreshing is true.
   */
  disabled?: boolean;
  /** Optional style override for the outer container. */
  style?: ViewStyle;
}

/**
 * Consistent "Synced X min ago (stale) [↻]" section header for any screen
 * that shows cached data.
 *
 * Renders:
 * - Title row — `label` (left) + refresh icon button (right)
 * - Meta row  — "Synced X min ago (stale)", "Refreshing…", or nothing
 *
 * Usage:
 * ```tsx
 * <SyncedAtBadge
 *   label="Invite Friends"
 *   syncedAt={syncedAt}
 *   isStale={isStale}
 *   isRefreshing={isRefreshing}
 *   onRefresh={handleRefresh}
 *   disabled={isCreating}
 * />
 * ```
 */
export function SyncedAtBadge({
  label,
  syncedAt,
  isStale = false,
  isRefreshing = false,
  onRefresh,
  disabled = false,
  style,
}: SyncedAtBadgeProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const buttonDisabled = disabled || isRefreshing;
  const iconColor = buttonDisabled ? (isDark ? '#555' : '#bbb') : '#007AFF';

  const metaText = isRefreshing
    ? 'Refreshing...'
    : syncedAt != null
      ? `Synced ${formatSyncedAgo(syncedAt)}${isStale ? ' (stale)' : ''}`
      : null;

  return (
    <View style={[styles.container, style]}>
      {/* Title row: label + refresh button */}
      <View style={styles.titleRow}>
        {label != null && (
          <ThemedText type="titleMedium" style={styles.label}>
            {label}
          </ThemedText>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Refresh${label != null ? ` ${label}` : ''}`}
          accessibilityHint="Fetch latest data from server"
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={buttonDisabled}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <MaterialIcons name="refresh" size={18} color={iconColor} />
          )}
        </Pressable>
      </View>

      {/* Meta row: timestamp / refreshing status */}
      {metaText != null && (
        <ThemedText
          type="bodySmall"
          lightColor={isRefreshing ? '#666' : '#888'}
          darkColor={isRefreshing ? '#999' : '#777'}
          style={styles.metaText}
        >
          {metaText}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    flex: 1,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    marginTop: 2,
    marginBottom: 6,
  },
});
