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
  const [displayName, setDisplayName] = useState<string>('User');

  useEffect(() => {
    // Fetch user data in background
    const fetchUserData = async () => {
      try {
        const userData = await apiClient.auth.me();
        setAvatarUrl(userData.avatarHeadshotUrl);
        setDisplayName(userData.robloxDisplayName || userData.robloxUsername || 'User');
      } catch (error) {
        // Silently fail - header identity is not critical
        logger.warn('Failed to fetch user header profile', {
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

  function handleOpenMe() {
    router.push("/me");
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        animationDuration: 220,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: '',
          headerLeft: () => (
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={handleOpenMe} activeOpacity={0.7} style={styles.profileButton}>
                <Image
                  source={
                    avatarUrl
                      ? { uri: avatarUrl }
                      : require('@/assets/images/avatar-placeholder.png')
                  }
                  style={styles.avatar}
                />
              </TouchableOpacity>
              <ThemedText type="bodyLarge" numberOfLines={1} style={styles.displayName}>
                {displayName}
              </ThemedText>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
              <ThemedText type="bodyLarge" lightColor="#007AFF" darkColor="#007AFF">
                Sign Out
              </ThemedText>
            </TouchableOpacity>
          ),
          headerLeftContainerStyle: styles.headerSideContainer,
          headerRightContainerStyle: styles.headerSideContainer,
        }}
      />
      <Stack.Screen name="create" options={{ title: "Create Session" }} />
      <Stack.Screen name="[id]" options={{ title: "Session Details" }} />
      <Stack.Screen name="handoff" options={{ title: "Join Handoff" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerSideContainer: {
    paddingHorizontal: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 220,
  },
  profileButton: {
    marginRight: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e0e0',
  },
  displayName: {
    flexShrink: 1,
  },
  signOutButton: {
    paddingVertical: 4,
  },
});
