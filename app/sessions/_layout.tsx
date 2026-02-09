import { Stack, useRouter } from "expo-router";
import { TouchableOpacity } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ThemedText } from "@/components/themed-text";

export default function SessionsLayout() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { handleError } = useErrorHandler();

  async function handleSignOut() {
    try {
      await signOut();
      router.replace("/auth/sign-in");
    } catch (error) {
      handleError(error, { fallbackMessage: "Failed to sign out" });
    }
  }

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Sessions",
          headerRight: () => (
            <TouchableOpacity onPress={handleSignOut} style={{ marginRight: 4 }}>
              <ThemedText type="bodyLarge" lightColor="#007AFF" darkColor="#007AFF">
                Sign Out
              </ThemedText>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="create" options={{ title: "Create Session" }} />
      <Stack.Screen name="[id]" options={{ title: "Session Details" }} />
    </Stack>
  );
}
