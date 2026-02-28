import { useState } from "react";
import { View, StyleSheet, Alert, Platform, Linking as RNLinking } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Checkbox } from "react-native-paper";
import { useAuth } from "@/src/features/auth/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { resolveAccountLinkConflict } from "@/src/features/auth/accountLinkConflict";
import { apiClient } from "@/src/lib/api";
import { RobloxSignInButton } from "@/components/auth/RobloxSignInButton";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AppleSignInButton } from "@/components/auth/AppleSignInButton";

const TERMS_OF_SERVICE_URL = "https://ilpeppino.github.io/lagalaga/terms.html";
const PRIVACY_POLICY_URL = "https://ilpeppino.github.io/lagalaga/privacy-policy.html";

export default function SignInScreen() {
  const [loadingProvider, setLoadingProvider] = useState<"roblox" | "google" | "apple" | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const { signInWithRoblox, signInWithGoogle, signInWithApple } = useAuth();
  const { handleError } = useErrorHandler();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const canSignIn = acceptedTerms && acceptedPrivacy && !loadingProvider;
  const robloxLoading = loadingProvider === "roblox";
  const googleLoading = loadingProvider === "google";
  const appleLoading = loadingProvider === "apple";

  async function handleRobloxSignIn() {
    try {
      setLoadingProvider("roblox");
      await signInWithRoblox();
    } catch (error) {
      handleError(error, { fallbackMessage: "Failed to sign in with Roblox. Please try again." });
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleGoogleSignIn() {
    try {
      setLoadingProvider("google");
      await signInWithGoogle();
    } catch (error) {
      handleError(error, { fallbackMessage: "Failed to sign in with Google. Please try again." });
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleAppleSignIn() {
    try {
      setLoadingProvider("apple");
      await signInWithApple();
      const me = await apiClient.auth.me();
      router.replace(me.robloxConnected ? "/sessions" : "/auth/connect-roblox");
    } catch (error) {
      const conflictResolution = resolveAccountLinkConflict(error, "apple");
      if (conflictResolution.handled) {
        Alert.alert(conflictResolution.title, conflictResolution.message, [
          {
            text: "Log in with original method",
            onPress: () => {
              router.replace("/auth/sign-in");
            },
          },
          {
            text: "Contact support",
            onPress: () => {
              void RNLinking.openURL("mailto:lagalaga@gtemp1.com?subject=Account%20Link%20Conflict");
            },
          },
        ]);
        return;
      }

      handleError(error, { fallbackMessage: "Failed to sign in with Apple. Please try again." });
    } finally {
      setLoadingProvider(null);
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
          {Platform.OS === "ios" ? (
            <>
              <RobloxSignInButton
                onPress={() => { void handleRobloxSignIn(); }}
                loading={robloxLoading}
                disabled={!canSignIn}
                style={styles.button}
                contentStyle={styles.buttonContent}
              />
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <ThemedText type="labelMedium" lightColor="#8e8e93" darkColor="#8e8e93">
                  OR
                </ThemedText>
                <View style={styles.dividerLine} />
              </View>
              <AppleSignInButton
                onPress={() => { void handleAppleSignIn(); }}
                disabled={!canSignIn}
                loading={appleLoading}
              />
              <ThemedText type="bodySmall" lightColor="#6b6b72" darkColor="#9a9aa1" style={styles.helperText}>
                If you sign in with Apple, you will need to connect your Roblox account to use Lagalaga.
              </ThemedText>
            </>
          ) : (
            <>
              <RobloxSignInButton
                onPress={() => { void handleRobloxSignIn(); }}
                loading={robloxLoading}
                disabled={!canSignIn}
                style={styles.button}
                contentStyle={styles.buttonContent}
              />
              <GoogleSignInButton
                onPress={() => { void handleGoogleSignIn(); }}
                loading={googleLoading}
                disabled={!canSignIn}
                style={styles.button}
              />
            </>
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
            Requires a 13+ Roblox account.
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#d1d1d6",
  },
  helperText: {
    lineHeight: 18,
    marginTop: 2,
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
