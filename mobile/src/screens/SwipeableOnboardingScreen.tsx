import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Linking,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { spacing, borderRadii } from "../theme/spacing";
import { typography } from "../theme/fonts";

const { width } = Dimensions.get("window");

interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  highlights: string[];
}

const slides: OnboardingSlide[] = [
  {
    id: "search",
    title: "Search Your Memories Instantly",
    description:
      "Ask in natural language and instantly find photos, documents, and more.",
    icon: "SEARCH",
    accent: "#10B981",
    highlights: [
      "Search photos, PDFs, and notes in one place",
      "Natural language queries work instantly",
      "Visual results with confidence scores",
    ],
  },
  {
    id: "privacy",
    title: "Privacy-First & Local",
    description:
      "All processing happens on your device. Your data never leaves your phone.",
    icon: "PRIVACY",
    accent: "#22C55E",
    highlights: [
      "Local indexing and encrypted cache",
      "No uploads unless you explicitly share",
      "Full control over your data",
    ],
  },
  {
    id: "ai",
    title: "Powered by AI",
    description:
      "Advanced image understanding and semantic search tuned for your files.",
    icon: "AI",
    accent: "#06B6D4",
    highlights: [
      "Semantic search across images and text",
      "Context-aware answers and summaries",
      "Fast response times with smart caching",
    ],
  },
  {
    id: "start",
    title: "Let’s Get Started",
    description:
      "Create your secure account and connect your memories in minutes.",
    icon: "START",
    accent: "#0EA5E9",
    highlights: [
      "Sign in to personalize your memory engine",
      "We’ll ask for file access after login",
      "Takes about two minutes to set up",
    ],
  },
];

export function SwipeableOnboardingScreen(props: {
  onComplete: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const dotAnimations = useRef(slides.map(() => new Animated.Value(0))).current;
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  useEffect(() => {
    slides.forEach((_, index) => {
      Animated.timing(dotAnimations[index], {
        toValue: index === currentIndex ? 1 : 0,
        duration: 280,
        useNativeDriver: true,
      }).start();
    });
  }, [currentIndex, dotAnimations]);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    setCurrentIndex(Math.min(index, slides.length - 1));
  };

  const goToSlide = (index: number) => {
    scrollViewRef.current?.scrollTo({
      x: index * width,
      animated: true,
    });
  };

  const isLastSlide = currentIndex === slides.length - 1;

  return (
    <LinearGradient
      colors={["#050505", "#0B1418", "#07110E"]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={props.onComplete} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        scrollEventThrottle={16}
        onScroll={handleScroll}
        showsHorizontalScrollIndicator={false}
      >
        {slides.map((s) => (
          <View key={s.id} style={styles.slide}>
            <View style={styles.slideContent}>
              <View style={[styles.iconWrap, { borderColor: `${s.accent}44` }]}>
                <Text style={[styles.iconLabel, { color: s.accent }]}>{s.icon}</Text>
              </View>

              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.description}>{s.description}</Text>

              <View style={styles.highlights}>
                {s.highlights.map((item) => (
                  <View key={item} style={styles.highlightRow}>
                    <View style={[styles.highlightDot, { backgroundColor: s.accent }]} />
                    <Text style={styles.highlightText}>{item}</Text>
                  </View>
                ))}
              </View>

              {isLastSlide && (
                <View style={styles.privacySection}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setAgreePrivacy(!agreePrivacy)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        agreePrivacy && styles.checkboxChecked,
                        agreePrivacy && { borderColor: colors.accent },
                      ]}
                    >
                      {agreePrivacy && <Text style={styles.checkmark}>OK</Text>}
                    </View>
                    <Text style={styles.privacyText}>
                      I agree to the{" "}
                      <Text
                        style={styles.privacyLink}
                        onPress={() => Linking.openURL("https://axyora.ai/privacy")}
                      >
                        Privacy Policy
                      </Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomNav}>
        <View style={styles.dotsContainer}>
          {slides.map((_, index) => {
            const scale = dotAnimations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.35],
            });
            const opacity = dotAnimations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 1],
            });
            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    transform: [{ scale }],
                    opacity,
                    backgroundColor: slides[index].accent,
                  },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.buttonRow}>
          {currentIndex > 0 && !isLastSlide && (
            <TouchableOpacity
              style={styles.buttonSecondary}
              onPress={() => goToSlide(currentIndex - 1)}
            >
              <Text style={styles.buttonText}>Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.buttonPrimary,
              isLastSlide && !agreePrivacy && styles.buttonDisabled,
            ]}
            onPress={() => {
              if (isLastSlide) {
                if (agreePrivacy) props.onComplete();
              } else {
                goToSlide(currentIndex + 1);
              }
            }}
            disabled={isLastSlide && !agreePrivacy}
          >
            <Text style={styles.buttonTextPrimary}>
              {isLastSlide ? "Create Account" : "Next"}
            </Text>
          </TouchableOpacity>
        </View>

        {isLastSlide && (
          <TouchableOpacity style={styles.secondaryLink} onPress={props.onComplete}>
            <Text style={styles.secondaryLinkText}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "flex-end",
  },
  skipButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadii.round,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipText: {
    ...typography.body2,
    color: colors.textSecondary,
  },
  slide: {
    width,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  slideContent: {
    alignItems: "center",
    gap: spacing.lg,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  icon: {
    fontSize: 60,
  },
  iconLabel: {
    fontSize: 14,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: "center",
  },
  description: {
    ...typography.body2,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
  },
  highlights: {
    marginTop: spacing.md,
    gap: spacing.sm,
    width: "100%",
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadii.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  highlightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  highlightText: {
    flex: 1,
    ...typography.body3,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  privacySection: {
    marginTop: spacing.lg,
    width: "100%",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
  },
  checkmark: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: "600",
  },
  privacyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  privacyLink: {
    color: colors.accent,
    textDecorationLine: "underline",
  },
  bottomNav: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
  },
  buttonSecondary: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadii.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    minWidth: 88,
  },
  buttonText: {
    color: colors.accent,
    ...typography.button,
    textAlign: "center",
  },
  buttonPrimary: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadii.lg,
    backgroundColor: colors.accent,
    minWidth: 160,
  },
  buttonTextPrimary: {
    color: colors.textInverse,
    ...typography.button,
    textAlign: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  secondaryLink: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  secondaryLinkText: {
    ...typography.body3,
    color: colors.textSecondary,
  },
});
