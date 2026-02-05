import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { getSessionsStore, type Session } from "@/src/features/sessions";

export default function SessionsListScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      const store = getSessionsStore();
      const data = await store.listUpcoming({ limit: 20 });
      setSessions(data);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatDateTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderSession({ item }: { item: Session }) {
    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() => router.push(`/sessions/${item.id}`)}
      >
        <Text style={styles.title}>{item.title || item.game.name}</Text>
        <Text style={styles.gameName}>{item.game.name}</Text>
        <View style={styles.details}>
          <Text style={styles.detailText}>
            {formatDateTime(item.startTimeUtc)}
          </Text>
          <Text style={styles.detailText}>Max: {item.maxPlayers} players</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        renderItem={renderSession}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No upcoming sessions</Text>
          </View>
        }
      />
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => router.push("/sessions/create")}
      >
        <Text style={styles.createButtonText}>Create Session</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  list: {
    padding: 16,
  },
  sessionCard: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  gameName: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  details: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailText: {
    fontSize: 12,
    color: "#888",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
  },
  createButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    margin: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  createButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
