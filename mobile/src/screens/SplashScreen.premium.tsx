import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Text,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, typography, spacing } from "../theme";
import { AnimatedLogo } from "../components/AnimatedLogo";

interface SplashScreenProps {
  onComplete?: () => void;
}

/**
 * Premium Splash Screen
 * Glassmorphic design with glow effect and smooth animations
 */
export function SplashScreen({ onComplete }: SplashScreenProps = {}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const glowOpacity = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    // Main sequence: fade in + scale up
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
      // Glow animation (subtle pulse)
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.4,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.2,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();

    const timer = setTimeout(() => {
      onComplete?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient
      colors={[colors.background, colors.backgroundAlt, colors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.content}>
        {/* Glow background effect */}
        <Animated.View
          style={[
            styles.glowBackground,
            {
              opacity: glowOpacity,
            },
          ]}
        />

        {/* Logo container with scale animation */}
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

        {/* Title with premium styling */}
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

        {/* Tagline with secondary color */}
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
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl,
  },
  glowBackground: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: colors.primary,
    opacity: 0.1,
  },
  logoContainer: {
    alignItems: "center",
    zIndex: 10,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  tagline: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
