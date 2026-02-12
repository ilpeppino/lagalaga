import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';

export default function RobloxDeepLinkCompatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();

  useEffect(() => {
    const normalizedParams: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      normalizedParams[key] = Array.isArray(value) ? value[0] : value;
    });

    router.replace({
      pathname: '/auth/roblox',
      params: normalizedParams,
    });
  }, [params, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <ThemedText type="bodyLarge" style={styles.text}>
        Redirecting...
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: 12,
  },
});
