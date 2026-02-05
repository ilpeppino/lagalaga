import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/src/lib/supabase";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const [status, setStatus] = useState<"loading" | "error" | "success">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    handleCallback();
  }, [params]);

  async function handleCallback() {
    try {
      // Check for errors in the callback URL
      if (params.error) {
        setStatus("error");
        setErrorMessage(
          params.error_description || params.error || "Authentication failed"
        );
        return;
      }

      // Exchange the code for a session
      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          params.code
        );

        if (error) {
          setStatus("error");
          setErrorMessage(error.message);
          return;
        }

        // Success! Session is now set via onAuthStateChange
        setStatus("success");
        setTimeout(() => {
          router.replace("/sessions");
        }, 500);
      } else {
        // No code and no error - might be an old-style token fragment
        // Try to get the session (it might already be set)
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setStatus("success");
          setTimeout(() => {
            router.replace("/sessions");
          }, 500);
        } else {
          setStatus("error");
          setErrorMessage("No authentication code received");
        }
      }
    } catch (error) {
      console.error("Callback error:", error);
      setStatus("error");
      setErrorMessage("Failed to complete sign in. Please try again.");
    }
  }

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.text}>Completing sign in...</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Sign In Failed</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <Text style={styles.hint}>Please try signing in again</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.successText}>✓ Signed in successfully!</Text>
      <Text style={styles.text}>Redirecting...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  successText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#34C759",
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FF3B30",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  hint: {
    fontSize: 14,
    color: "#888",
  },
});
