import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

export function MessageBubble(props: { role: "user" | "assistant"; text: string }) {
  const y = useRef(new Animated.Value(14)).current;
  const alpha = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(y, { toValue: 0, damping: 16, stiffness: 210, useNativeDriver: true }),
      Animated.timing(alpha, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [alpha, y]);

  const isUser = props.role === "user";

  return (
    <Animated.View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
        { opacity: alpha, transform: [{ translateY: y }] },
      ]}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.text}>{props.text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
    width: "100%",
  },
  userContainer: {
    alignItems: "flex-end",
  },
  assistantContainer: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "87%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: "#123327",
    borderColor: "#1D5A43",
  },
  assistantBubble: {
    backgroundColor: "#151C2D",
    borderColor: colors.border,
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
