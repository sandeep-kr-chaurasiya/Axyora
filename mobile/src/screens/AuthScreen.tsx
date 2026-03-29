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
  Keyboard
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
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
      <LinearGradient colors={["#06070B", "#0D1428", "#071A25"]} style={styles.container}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.header}>
            <AnimatedLogo />
            <Text style={styles.title}>Axyora</Text>
            <Text style={styles.subtitle}>
              {mode === "signin" ? "Neural login for your private memory" : "Initialize your local AI brain"}
            </Text>
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
                placeholder="identity@axyora.com"
                placeholderTextColor="#62708F"
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Access Key (Password)</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••••••"
                placeholderTextColor="#62708F"
                textContentType="password"
              />
            </View>

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
                  <ActivityIndicator color="#072117" />
                ) : (
                  <Text style={styles.buttonText}>
                    {mode === "signin" ? "Grant Access" : "Create Neural ID"}
                  </Text>
                )}
              </LinearGradient>
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
                  ? "Don't have a private ID? Initialize here" 
                  : "Already possess an identity? Grant access"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>🛡️ 100% Local Encryption</Text>
            <Text style={styles.footerSub}>Zero-knowledge privacy architecture</Text>
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
    paddingHorizontal: 28,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 12,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    maxWidth: "80%",
    lineHeight: 20,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "rgba(18, 26, 42, 0.7)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1.5,
    borderRadius: 16,
    color: colors.text,
    height: 56,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  error: {
    color: "#FFAAAA",
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    height: 58,
    borderRadius: 16,
    marginTop: 10,
    overflow: "hidden",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  btnGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#072117",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  switchButton: {
    marginTop: 24,
    alignItems: "center",
  },
  switchText: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 13,
  },
  footer: {
    marginTop: 50,
    alignItems: "center",
    opacity: 0.5,
  },
  footerText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  footerSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
});
