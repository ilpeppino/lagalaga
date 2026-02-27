import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';

export default function GoogleDeepLinkCompatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();

  useEffect(() => {
    const normalizedParams: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      normalizedParams[key] = Array.isArray(value) ? value[0] : value;
    });

    router.replace({
      pathname: '/auth/google' as any,
      params: normalizedParams,
    });
  }, [params, router]);

  return (
    <View style={styles.container}>
      <LagaLoadingSpinner size={56} label="Redirecting..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
