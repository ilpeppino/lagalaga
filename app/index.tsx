import { Redirect } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { LagaLoadingSpinner } from "@/components/ui/LagaLoadingSpinner";

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

  if (!user.robloxConnected) {
    return <Redirect href="/auth/connect-roblox" />;
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
