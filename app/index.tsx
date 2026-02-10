import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { useEffect, useState } from "react";
import { tokenStorage } from "@/src/lib/tokenStorage";

export default function Index() {
  const { user, loading } = useAuth();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if token exists as fallback
    tokenStorage.getToken().then((token) => {
      setHasToken(!!token);
    });
  }, []);

  if (loading || hasToken === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
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
