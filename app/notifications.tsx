import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { apiClient, type InAppNotification } from '@/src/lib/api';

function normalizeRouteData(data: Record<string, unknown>): {
  pathname: string | null;
  params: Record<string, string>;
} {
  const pathname = typeof data.route === 'string' ? data.route : null;
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === 'route') continue;
    if (value == null) continue;
    params[key] = String(value);
  }

  return { pathname, params };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiClient.notifications.list({ limit: 50 });
      setItems(result.notifications ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const unreadCount = useMemo(() => items.filter((item) => !item.isRead).length, [items]);

  const onPressItem = useCallback(
    async (item: InAppNotification) => {
      if (!item.isRead) {
        try {
          await apiClient.notifications.markRead(item.id);
          setItems((current) => current.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
        } catch {
          // Ignore read-mark failures and continue navigation.
        }
      }

      const payload = normalizeRouteData(item.data ?? {});
      if (!payload.pathname) {
        return;
      }

      router.push({ pathname: payload.pathname as any, params: payload.params } as any);
    },
    [router]
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Notifications', headerShown: true }} />

      {loading ? (
        <View style={styles.centered}>
          <LagaLoadingSpinner size={56} label="Loading notifications..." />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
        >
          <ThemedText type="bodySmall">Unread: {unreadCount}</ThemedText>

          {items.length === 0 ? (
            <ThemedView style={styles.card}>
              <ThemedText>No notifications yet.</ThemedText>
            </ThemedView>
          ) : (
            items.map((item) => (
              <Pressable key={item.id} onPress={() => void onPressItem(item)}>
                <ThemedView style={[styles.card, !item.isRead ? styles.unreadCard : null]}>
                  <ThemedText type="subtitle">{item.title}</ThemedText>
                  <ThemedText>{item.body}</ThemedText>
                  <ThemedText type="bodySmall">{new Date(item.createdAt).toLocaleString()}</ThemedText>
                </ThemedView>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 12,
    gap: 6,
  },
  unreadCard: {
    borderColor: '#1f6bff',
    backgroundColor: 'rgba(31, 107, 255, 0.06)',
  },
});
