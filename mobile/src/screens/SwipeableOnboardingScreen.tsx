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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

const { width } = Dimensions.get("window");

interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const slides: OnboardingSlide[] = [
  {
    id: "memory",
    title: "Your Memory, Organized",
    description:
      "Axyora finds anything from your device instantly.\n\nSearch photos, documents, audio, and text with natural language.",
    icon: "🧠",
    color: "#7C3AED",
  },
  {
    id: "privacy",
    title: "Private by Design",
    description:
      "All your data stays on your device.\n\nNothing is uploaded without your control. 100% local processing.",
    icon: "🔒",
    color: "#10B981",
  },
  {
    id: "images",
    title: "Understands Images",
    description:
      'Search photos like "mountain", "documents", "receipts".\n\nAI automatically extracts meaning from images.',
    icon: "🖼️",
    color: "#F59E0B",
  },
  {
    id: "ai",
    title: "AI That Knows Your Data",
    description:
      "Ask anything and get answers instantly.\n\nYour AI memory engine learns your files.",
    icon: "✨",
    color: "#06B6D4",
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
    // Animate active dot
    slides.forEach((_, index) => {
      Animated.timing(dotAnimations[index], {
        toValue: index === currentIndex ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  }, [currentIndex]);

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

  const slide = slides[currentIndex];
  const isLastSlide = currentIndex === slides.length - 1;

  return (
    <LinearGradient
      colors={["#06070B", "#0D1428", "#071A25"]}
      style={styles.container}
    >
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        scrollEventThrottle={16}
        onScroll={handleScroll}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={currentIndex < slides.length - 1}
      >
        {slides.map((s) => (
          <View key={s.id} style={styles.slide}>
            <View style={styles.slideContent}>
              {/* Icon */}
              <Text style={[styles.icon, { color: s.color }]}>{s.icon}</Text>

              {/* Title */}
              <Text style={styles.title}>{s.title}</Text>

              {/* Description */}
              <Text style={styles.description}>{s.description}</Text>

              {/* Privacy agreement on last slide */}
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
                      ]}
                    >
                      {agreePrivacy && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                    <Text style={styles.privacyText}>
                      I agree to the{" "}
                      <Text
                        style={styles.privacyLink}
                        onPress={() =>
                          Linking.openURL("https://axyora.ai/privacy")
                        }
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

      {/* Navigation Bottom */}
      <View style={styles.bottomNav}>
        {/* Dots */}
        <View style={styles.dotsContainer}>
          {dots.map((_, index) => {
            const scale = dotAnimations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.3],
            });
            const opacity = dotAnimations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [0.4, 1],
            });
            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    transform: [{ scale }],
                    opacity,
                    backgroundColor: slides[index].color,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          {currentIndex > 0 && (
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
              {isLastSlide ? "Get Started" : "Next"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

// Dummy dots array for rendering
const dots = Array(slides.length).fill(null);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  slideContent: {
    alignItems: "center",
    gap: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  privacySection: {
    marginTop: 20,
    width: "100%",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
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
    color: "#06070B",
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
    paddingBottom: 24,
    paddingHorizontal: 16,
    gap: 16,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  buttonSecondary: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    minWidth: 80,
  },
  buttonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonPrimary: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.accent,
    minWidth: 100,
  },
  buttonTextPrimary: {
    color: "#06070B",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
