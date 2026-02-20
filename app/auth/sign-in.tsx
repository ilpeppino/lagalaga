import { useState } from "react";
import { View, StyleSheet } from "react-native";
import * as Linking from "expo-linking";
import { Checkbox } from "react-native-paper";
import { useAuth } from "@/src/features/auth/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ThemedText } from "@/components/themed-text";
import { AnimatedButton } from "@/components/ui/paper";
import { useColorScheme } from "@/hooks/use-color-scheme";

const TERMS_OF_SERVICE_URL = "https://ilpeppino.github.io/lagalaga/terms.html";
const PRIVACY_POLICY_URL = "https://ilpeppino.github.io/lagalaga/privacy-policy.html";

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const { signInWithRoblox } = useAuth();
  const { handleError } = useErrorHandler();
  const colorScheme = useColorScheme();
  const canSignIn = acceptedTerms && acceptedPrivacy && !loading;

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
          lightColor="#4a4a4a"
          darkColor="#c7c7cc"
          style={styles.subtitle}
        >
          Plan Roblox sessions with friends.
        </ThemedText>

        <View style={styles.form}>
          <AnimatedButton
            title="Sign in with Roblox"
            variant="filled"
            onPress={handleRobloxSignIn}
            loading={loading}
            disabled={!canSignIn}
            enableHaptics
            buttonColor="#007AFF"
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          />

          <View style={styles.ackContainer}>
            <View style={styles.ackRow}>
              <Checkbox
                status={acceptedTerms ? "checked" : "unchecked"}
                onPress={() => setAcceptedTerms((current) => !current)}
              />
              <ThemedText type="bodyMedium" style={styles.ackText}>
                I have read and agree to the{" "}
                <ThemedText
                  type="link"
                  onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
                  suppressHighlighting
                >
                  Terms of Service
                </ThemedText>
                .
              </ThemedText>
            </View>

            <View style={styles.ackRow}>
              <Checkbox
                status={acceptedPrivacy ? "checked" : "unchecked"}
                onPress={() => setAcceptedPrivacy((current) => !current)}
              />
              <ThemedText type="bodyMedium" style={styles.ackText}>
                I have read and agree to the{" "}
                <ThemedText
                  type="link"
                  onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                  suppressHighlighting
                >
                  Privacy Policy
                </ThemedText>
                .
              </ThemedText>
            </View>
          </View>

          <ThemedText
            type="bodyMedium"
            lightColor="#6b6b72"
            darkColor="#9a9aa1"
            style={styles.hint}
          >
            Requires a 13+ Roblox account.
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
    marginBottom: 36,
    textAlign: "center",
  },
  form: {
    gap: 10,
  },
  ackContainer: {
    gap: 4,
    marginTop: 4,
  },
  ackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  ackText: {
    flex: 1,
    paddingTop: 7,
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
    fontSize: 13,
    marginTop: 2,
  },
});
