import { Stack, useRouter } from "expo-router";
import { TouchableOpacity, Text } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";

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
              <Text style={{ color: "#007AFF", fontSize: 16 }}>Sign Out</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="create" options={{ title: "Create Session" }} />
      <Stack.Screen name="[id]" options={{ title: "Session Details" }} />
    </Stack>
  );
}
