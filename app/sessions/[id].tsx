import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getSessionsStore, type Session } from "@/src/features/sessions";

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

      <TouchableOpacity style={styles.joinButton}>
        <Text style={styles.joinButtonText}>Join Session</Text>
      </TouchableOpacity>
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
  joinButton: {
    backgroundColor: "#34C759",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
