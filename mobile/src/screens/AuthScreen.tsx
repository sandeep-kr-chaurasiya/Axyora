import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Linking,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { spacing, borderRadii, shadows } from "../theme/spacing";
import { typography } from "../theme/fonts";
import { AnimatedLogo } from "../components/AnimatedLogo";

export function AuthScreen(props: {
  onSignIn: (email: string, password: string) => Promise<unknown>;
  onSignUp: (email: string, password: string) => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await props.onSignIn(email, password);
      } else {
        await props.onSignUp(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <LinearGradient colors={["#050505", "#0B1418", "#07110E"]} style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.header}>
            <AnimatedLogo />
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Your AI memory engine is ready.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@axyora.ai"
                placeholderTextColor={colors.textMuted}
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••••••"
                placeholderTextColor={colors.textMuted}
                textContentType="password"
              />
            </View>

            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => Alert.alert("Reset Password", "Password reset flow is not wired yet.")}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={submit}
              disabled={loading}
            >
              <LinearGradient
                colors={[colors.accent, colors.accentAlt || colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>
                    {mode === "signin" ? "Sign In" : "Create Account"}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity style={styles.socialButton} onPress={() => Alert.alert("Google Sign In", "Not configured yet.")}
            >
              <Text style={styles.socialText}>Continue with Google</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialButton} onPress={() => Alert.alert("Apple Sign In", "Not configured yet.")}
            >
              <Text style={styles.socialText}>Continue with Apple</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => {
                setError(null);
                setMode((prev) => (prev === "signin" ? "signup" : "signin"));
              }}
            >
              <Text style={styles.switchText}>
                {mode === "signin"
                  ? "Don’t have an account? Sign up"
                  : "Already have an account? Sign in"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing you agree to our{" "}
              <Text style={styles.footerLink} onPress={() => Linking.openURL("https://axyora.ai/terms")}>Terms</Text>
              {" "}and{" "}
              <Text style={styles.footerLink} onPress={() => Linking.openURL("https://axyora.ai/privacy")}>Privacy</Text>
            </Text>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    ...typography.body2,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label2,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.inputBorder,
    borderWidth: 1.5,
    borderRadius: borderRadii.lg,
    color: colors.text,
    height: 54,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
  },
  forgotRow: {
    alignItems: "flex-end",
    marginBottom: spacing.lg,
  },
  forgotText: {
    ...typography.body3,
    color: colors.textSecondary,
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    padding: spacing.md,
    borderRadius: borderRadii.md,
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.error,
    ...typography.body3,
  },
  button: {
    borderRadius: borderRadii.lg,
    overflow: "hidden",
    ...shadows.md,
  },
  btnGradient: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  buttonText: {
    color: colors.textInverse,
    ...typography.buttonLarge,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  dividerText: {
    color: colors.textMuted,
    ...typography.body3,
  },
  socialButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  socialText: {
    color: colors.text,
    ...typography.button,
  },
  switchButton: {
    marginTop: spacing.sm,
    alignItems: "center",
  },
  switchText: {
    color: colors.textSecondary,
    ...typography.body3,
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: "center",
  },
  footerText: {
    color: colors.textMuted,
    ...typography.caption,
    textAlign: "center",
  },
  footerLink: {
    color: colors.accent,
  },
});
