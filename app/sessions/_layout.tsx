import { Stack, useRouter } from "expo-router";
import { TouchableOpacity, Text, Alert } from "react-native";
import { supabase } from "@/src/lib/supabase";

export default function SessionsLayout() {
  const router = useRouter();

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        router.replace("/auth/sign-in");
      }
    } catch (error) {
      console.error("Sign out error:", error);
      Alert.alert("Error", "Failed to sign out");
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
