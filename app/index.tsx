import { Redirect } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { LagaLoadingSpinner } from "@/components/ui/LagaLoadingSpinner";
import { logger } from "@/src/lib/logger";
import { shouldRequireRobloxConnection } from "@/src/features/auth/robloxConnectionGate";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <LagaLoadingSpinner size={56} label="Loading..." />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/auth/sign-in" />;
  }

  if (shouldRequireRobloxConnection(user)) {
    logger.info('Routing to connect screen from index gate', {
      reason: 'roblox_not_connected',
    });
    return <Redirect href="/auth/connect-roblox" />;
  }

  logger.info('Routing to sessions from index gate', {
    reason: 'roblox_connected',
  });
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
