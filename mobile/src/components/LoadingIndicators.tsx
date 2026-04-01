/**
 * Loading Indicators
 * Premium skeleton loading and typing dots
 */

import React, { useRef, useEffect } from "react";
import { View, Animated } from "react-native";
import { colors, spacing, borderRadii } from "../theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  variant?: "text" | "button" | "image" | "title";
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 16,
  borderRadius = borderRadii.md,
  variant = "text",
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.5, 0.3],
  });

  const variantSizes: Record<string, { height: number }> = {
    text: { height: 16 },
    button: { height: 48 },
    image: { height: 200 },
    title: { height: 28 },
  };

  const skeletonHeight = variant in variantSizes ? variantSizes[variant].height : height;

  return (
    <Animated.View
      style={{
        width: width as any,
        height: skeletonHeight,
        backgroundColor: colors.skeleton,
        borderRadius,
        opacity,
      }}
    />
  );
};

export const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <View
    style={{
      backgroundColor: colors.surface,
      borderRadius: borderRadii.xl,
      padding: spacing.lg,
      gap: spacing.md,
    }}
  >
    <Skeleton variant="title" width="60%" />
    {Array(lines)
      .fill(0)
      .map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
  </View>
);

interface TypingIndicatorProps {
  color?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ color = colors.primary }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (value: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.sequence([
            Animated.timing(value, {
              toValue: -8,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(300),
        ])
      );
    };

    createDotAnimation(dot1, 0).start();
    createDotAnimation(dot2, 200).start();
    createDotAnimation(dot3, 400).start();
  }, [dot1, dot2, dot3]);

  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.sm,
        alignItems: "center",
      }}
    >
      {[dot1, dot2, dot3].map((dotAnim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
            opacity: 0.6,
            transform: [{ translateY: dotAnim }],
          }}
        />
      ))}
    </View>
  );
};

export const Loader: React.FC<{ size?: "sm" | "md" | "lg"; color?: string }> = ({
  size = "md",
  color = colors.primary,
}) => {
  const rotateValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateValue, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      })
    ).start();
  }, [rotateValue]);

  const rotate = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const sizeMap = { sm: 24, md: 36, lg: 48 };
  const loaderSize = sizeMap[size];

  return (
    <Animated.View
      style={{
        width: loaderSize,
        height: loaderSize,
        borderRadius: loaderSize / 2,
        borderWidth: 2,
        borderColor: `${color}40`,
        borderTopColor: color,
        transform: [{ rotate }],
      }}
    />
  );
};

export default {
  Skeleton,
  SkeletonCard,
  TypingIndicator,
  Loader,
};
