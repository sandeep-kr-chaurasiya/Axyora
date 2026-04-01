import React, { useEffect, useRef } from "react";
import { StyleSheet, Animated, SafeAreaView } from "react-native";
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
  const glowAnim = useRef(new Animated.Value(0)).current;

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

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    const timer = setTimeout(() => {
      onComplete?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient
      colors={["#050505", "#0B1418", "#07110E"]}
      style={styles.container}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            opacity: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.25, 0.6],
            }),
          },
        ]}
      />
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

        <Animated.Text style={[styles.title, { opacity: fadeAnim }]}>
          Axyora
        </Animated.Text>

        <Animated.Text style={[styles.tagline, { opacity: fadeAnim }]}>
          Your AI Memory Engine
        </Animated.Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glow: {
    position: "absolute",
    top: -120,
    left: -40,
    right: -40,
    height: 300,
    borderBottomLeftRadius: 240,
    borderBottomRightRadius: 240,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
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
    letterSpacing: 0.8,
  },
  tagline: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
