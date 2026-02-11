import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useAuth } from "@/src/features/auth/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/paper";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const { signInWithRoblox } = useAuth();
  const { handleError } = useErrorHandler();
  const colorScheme = useColorScheme();

  async function handleRobloxSignIn() {
    try {
      setLoading(true);
      await signInWithRoblox();
    } catch (error) {
      handleError(error, { fallbackMessage: "Failed to sign in with Roblox. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
      <View style={styles.content}>
        <ThemedText
          type="headlineLarge"
          style={styles.title}
        >
          Welcome to Lagalaga
        </ThemedText>

        <ThemedText
          type="bodyLarge"
          lightColor="#666"
          darkColor="#999"
          style={styles.subtitle}
        >
          Sign in with Roblox
        </ThemedText>

        <View style={styles.form}>
          <Button
            title="Sign in with Roblox"
            variant="filled"
            onPress={handleRobloxSignIn}
            loading={loading}
            disabled={loading}
            buttonColor="#007AFF"
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          />

          <ThemedText
            type="bodyMedium"
            lightColor="#888"
            darkColor="#aaa"
            style={styles.hint}
          >
            You will be redirected to Roblox to authorize the app
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    marginBottom: 32,
    textAlign: "center",
  },
  form: {
    gap: 16,
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    minHeight: 52,
  },
  buttonLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    textAlign: "center",
  },
});
