import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedLogo } from "../components/AnimatedLogo";
import { colors } from "../theme/colors";

export function SplashScreen() {
  return (
    <LinearGradient colors={["#06070B", "#0A1021", "#071622"]} style={styles.container}>
      <AnimatedLogo />
      <Text style={styles.title}>Axyora</Text>
      <Text style={styles.tagline}>Privacy-first AI memory engine</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
