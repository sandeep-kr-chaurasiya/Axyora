import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, Image } from "react-native";
import { colors, spacing, borderRadii, shadows, typography } from "../theme";

export function MessageBubble(props: { role: "user" | "assistant"; text: string }) {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  const isUser = props.role === "user";

  return (
    <Animated.View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
        {
          opacity: opacityAnim,
          transform: [{ translateX: isUser ? slideAnim : slideAnim.interpolate({inputRange: [0, 30], outputRange: [0, -30]}) }],
        },
      ]}
    >
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
        {/* Axyora Logo for Assistant */}
        {!isUser && (
          <Image
            source={require("../../Axyora transparent .png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        )}

        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={styles.text}>{props.text}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    width: "100%",
    overflow: "hidden",
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
  },
  logoImage: {
    width: 28,
    height: 28,
    marginBottom: spacing.xs,
  },
  userContainer: {
    alignItems: "flex-end",
  },
  assistantContainer: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: borderRadii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  userBubble: {
    // Premium purple/blue gradient feel
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
    ...shadows.md,
  },
  assistantBubble: {
    // Premium glassmorphic dark
    backgroundColor: colors.surfaceGlass,
    borderColor: colors.border,
    ...shadows.sm,
  },
  text: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
});
