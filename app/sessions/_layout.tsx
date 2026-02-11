import { Stack, useRouter } from "expo-router";
import { TouchableOpacity, View, Image, StyleSheet } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ThemedText } from "@/components/themed-text";
import { useState, useEffect } from "react";
import { apiClient } from "@/src/lib/api";
import { logger } from "@/src/lib/logger";

export default function SessionsLayout() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { handleError } = useErrorHandler();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user data in background
    const fetchUserData = async () => {
      try {
        const userData = await apiClient.auth.me();
        setAvatarUrl(userData.avatarHeadshotUrl);
      } catch (error) {
        // Silently fail - avatar is not critical
        logger.warn('Failed to fetch user avatar', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    fetchUserData();
  }, []);

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
            <View style={styles.headerRight}>
              <Image
                source={
                  avatarUrl
                    ? { uri: avatarUrl }
                    : require('@/assets/images/avatar-placeholder.png')
                }
                style={styles.avatar}
              />
              <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
                <ThemedText type="bodyLarge" lightColor="#007AFF" darkColor="#007AFF">
                  Sign Out
                </ThemedText>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Stack.Screen name="create" options={{ title: "Create Session" }} />
      <Stack.Screen name="[id]" options={{ title: "Session Details" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e0e0',
  },
  signOutButton: {
    marginRight: 4,
  },
});
