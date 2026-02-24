import { Redirect } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { useEffect, useState } from "react";
import { tokenStorage } from "@/src/lib/tokenStorage";
import { LagaLoadingSpinner } from "@/components/ui/LagaLoadingSpinner";
import { logger } from "@/src/lib/logger";

export default function Index() {
  const { user, loading } = useAuth();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if token exists as fallback
    void tokenStorage.getToken()
      .then((token) => {
        setHasToken(!!token);
      })
      .catch((error) => {
        logger.error('Failed to load stored token', {
          error: error instanceof Error ? error.message : String(error),
        });
        setHasToken(false);
      });
  }, []);

  if (loading || hasToken === null) {
    return (
      <View style={styles.container}>
        <LagaLoadingSpinner size={56} label="Loading..." />
      </View>
    );
  }

  // If we have a token but no user yet (e.g., during OAuth callback),
  // allow navigation to sessions - the user will load shortly
  if (hasToken) {
    return <Redirect href="/sessions" />;
  }

  if (!user) {
    return <Redirect href="/auth/sign-in" />;
  }

  return <Redirect href="/sessions" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
});
