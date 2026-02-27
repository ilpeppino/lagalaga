import { useEffect, useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { Checkbox } from "react-native-paper";
import { useAuth } from "@/src/features/auth/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ThemedText } from "@/components/themed-text";
import { AnimatedButton } from "@/components/ui/paper";
import { useColorScheme } from "@/hooks/use-color-scheme";

const TERMS_OF_SERVICE_URL = "https://ilpeppino.github.io/lagalaga/terms.html";
const PRIVACY_POLICY_URL = "https://ilpeppino.github.io/lagalaga/privacy-policy.html";

export default function SignInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const { signInWithApple } = useAuth();
  const { handleError } = useErrorHandler();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (Platform.OS !== "ios") {
      setAppleAvailable(false);
      return;
    }

    void AppleAuthentication.isAvailableAsync()
      .then((available) => {
        setAppleAvailable(available);
      })
      .catch(() => {
        setAppleAvailable(false);
      });
  }, []);

  async function handleAppleSignIn() {
    if (loading) return;
    try {
      setLoading(true);
      const signedIn = await signInWithApple();
      if (signedIn) {
        router.replace("/");
      }
    } catch (error) {
      handleError(error, { fallbackMessage: "Failed to sign in with Apple. Please try again." });
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
          {Platform.OS === "ios" && appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                colorScheme === "dark"
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={8}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          ) : (
            <AnimatedButton
              title="Continue with Apple"
              variant="outlined"
              onPress={() => {}}
              disabled
              style={styles.button}
              contentStyle={styles.buttonContent}
            />
          )}

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
            You can connect Roblox after signing in.
          </ThemedText>

          <ThemedText
            type="bodyMedium"
            lightColor="#9a9aa1"
            darkColor="#6b6b72"
            style={styles.disclaimer}
          >
            Lagalaga is not affiliated with, endorsed by, or sponsored by Roblox Corporation.
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
  appleButton: {
    width: "100%",
    height: 52,
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
  disclaimer: {
    textAlign: "center",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 16,
  },
});
