import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Text,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { typography, spacing } from "../theme/spacing";
import { AnimatedLogo } from "../components/AnimatedLogo";

interface SplashScreenProps {
  onComplete?: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps = {}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      onComplete?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient
      colors={["#06070B", "#0A1021", "#071622"]}
      style={styles.container}
    >
      <SafeAreaView style={styles.content}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <AnimatedLogo />
        </Animated.View>

        <Animated.Text
          style={[
            styles.title,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          Axyora
        </Animated.Text>

        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          Privacy-first AI Memory
        </Animated.Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl,
  },
  logoContainer: {
    alignItems: "center",
  },
  title: {
    ...typography.h1,
    color: colors.text,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  tagline: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
