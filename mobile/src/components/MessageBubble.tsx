import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
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
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser && styles.userText]}>{props.text}</Text>
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
    backgroundColor: colors.accent,
    borderColor: colors.primaryDark,
    borderTopLeftRadius: borderRadii.md,
    ...shadows.md,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceGlass,
    borderColor: colors.border,
    borderTopRightRadius: borderRadii.md,
    ...shadows.sm,
  },
  text: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  userText: {
    color: colors.textInverse,
  },
});
