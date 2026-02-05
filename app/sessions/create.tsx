import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  getSessionsStore,
  type SessionType,
  type CreateSessionInput,
} from "@/src/features/sessions";

const sessionTypes: SessionType[] = ["casual", "ranked", "tournament", "practice"];

export default function CreateSessionScreen() {
  const router = useRouter();
  const [gameName, setGameName] = useState("");
  const [gameUrl, setGameUrl] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [sessionType, setSessionType] = useState<SessionType>("casual");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!gameName.trim()) {
      Alert.alert("Error", "Game name is required");
      return;
    }
    if (!gameUrl.trim()) {
      Alert.alert("Error", "Game URL is required");
      return;
    }
    if (!startDate.trim() || !startTime.trim()) {
      Alert.alert("Error", "Start date and time are required");
      return;
    }

    try {
      setSubmitting(true);
      const startTimeUtc = new Date(`${startDate}T${startTime}`).toISOString();

      const input: CreateSessionInput = {
        gameName: gameName.trim(),
        gameUrl: gameUrl.trim(),
        title: title.trim() || undefined,
        startTimeUtc,
        maxPlayers: parseInt(maxPlayers, 10) || 4,
        sessionType,
      };

      const store = getSessionsStore();
      const session = await store.createSession(input);

      router.replace(`/sessions/${session.id}`);
    } catch (error) {
      console.error("Failed to create session:", error);
      Alert.alert("Error", "Failed to create session. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.field}>
        <Text style={styles.label}>Game Name</Text>
        <TextInput
          style={styles.input}
          value={gameName}
          onChangeText={setGameName}
          placeholder="e.g., Blox Fruits"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Game URL</Text>
        <TextInput
          style={styles.input}
          value={gameUrl}
          onChangeText={setGameUrl}
          placeholder="https://www.roblox.com/games/..."
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Session Title (optional)</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Grind and Farm Session"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="2026-02-05"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Start Time (HH:MM)</Text>
        <TextInput
          style={styles.input}
          value={startTime}
          onChangeText={setStartTime}
          placeholder="14:00"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Max Players</Text>
        <TextInput
          style={styles.input}
          value={maxPlayers}
          onChangeText={setMaxPlayers}
          keyboardType="number-pad"
          placeholder="4"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Session Type</Text>
        <View style={styles.typePicker}>
          {sessionTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeOption,
                sessionType === type && styles.typeOptionActive,
              ]}
              onPress={() => setSessionType(type)}
            >
              <Text
                style={[
                  styles.typeText,
                  sessionType === type && styles.typeTextActive,
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? "Creating..." : "Create Session"}
        </Text>
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
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
  },
  typePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f5f5f5",
  },
  typeOptionActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  typeText: {
    fontSize: 14,
    color: "#333",
    textTransform: "capitalize",
  },
  typeTextActive: {
    color: "#fff",
  },
  submitButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
