import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getSessionsStore, type Session } from "@/src/features/sessions";
import { apiClient } from "@/src/lib/api";
import { useAuth } from "@/src/features/auth/useAuth";

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadSession();
  }, [id]);

  async function loadSession() {
    try {
      setLoading(true);
      const store = getSessionsStore();
      const data = await store.getSessionById(id);
      setSession(data);
    } catch (error) {
      console.error("Failed to load session:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!id) return;

    try {
      setActionLoading(true);
      await apiClient.sessions.join(id);
      Alert.alert("Success", "You have joined the session!");
      await loadSession(); // Refresh to show updated participants
    } catch (error) {
      console.error("Failed to join session:", error);
      Alert.alert("Error", "Failed to join session. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeave() {
    if (!id) return;

    Alert.alert(
      "Leave Session",
      "Are you sure you want to leave this session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              await apiClient.sessions.leave(id);
              router.back();
            } catch (error) {
              console.error("Failed to leave session:", error);
              Alert.alert("Error", "Failed to leave session. Please try again.");
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  function formatDateTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const isHost = user && session && user.id === session.hostUserId;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Session not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.mainTitle}>{session.title || session.game.name}</Text>
        {session.title && (
          <Text style={styles.subtitle}>{session.game.name}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game</Text>
        <Text style={styles.value}>{session.game.name}</Text>
        <Text style={styles.label}>Platform</Text>
        <Text style={styles.value}>{session.game.platformKey}</Text>
        {session.game.genre && (
          <>
            <Text style={styles.label}>Genre</Text>
            <Text style={styles.value}>{session.game.genre}</Text>
          </>
        )}
        <Text style={styles.label}>URL</Text>
        <Text style={[styles.value, styles.link]}>{session.game.url}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <Text style={styles.label}>Start Time</Text>
        <Text style={styles.value}>{formatDateTime(session.startTimeUtc)}</Text>
        {session.durationMinutes && (
          <>
            <Text style={styles.label}>Duration</Text>
            <Text style={styles.value}>{session.durationMinutes} minutes</Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Session Details</Text>
        <Text style={styles.label}>Type</Text>
        <Text style={[styles.value, styles.capitalized]}>{session.sessionType}</Text>
        <Text style={styles.label}>Max Players</Text>
        <Text style={styles.value}>{session.maxPlayers}</Text>
        <Text style={styles.label}>Visibility</Text>
        <Text style={[styles.value, styles.capitalized]}>{session.visibility}</Text>
        <Text style={styles.label}>Status</Text>
        <Text style={[styles.value, styles.capitalized]}>{session.status}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Join Link</Text>
        <Text style={styles.placeholder}>Join link will be available soon</Text>
      </View>

      {!isHost && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.joinButton, actionLoading && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.joinButtonText}>Join Session</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.leaveButton, actionLoading && styles.buttonDisabled]}
            onPress={handleLeave}
            disabled={actionLoading}
          >
            <Text style={styles.leaveButtonText}>Leave Session</Text>
          </TouchableOpacity>
        </View>
      )}

      {isHost && (
        <View style={styles.hostBadge}>
          <Text style={styles.hostBadgeText}>You are the host</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#999",
  },
  section: {
    marginBottom: 24,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: "#888",
    marginTop: 12,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 16,
    color: "#333",
  },
  capitalized: {
    textTransform: "capitalize",
  },
  link: {
    color: "#007AFF",
  },
  placeholder: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
  buttonContainer: {
    gap: 12,
    marginTop: 12,
  },
  joinButton: {
    backgroundColor: "#34C759",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  leaveButton: {
    backgroundColor: "#FF3B30",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  leaveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  hostBadge: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  hostBadgeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
