/**
 * Premium Input Component
 * Glassmorphic with smooth focus animations and glass effect
 */

import React, { useRef, useState } from "react";
import {
  TextInput,
  View,
  Animated,
  ViewStyle,
  TextInputProps,
  Text,
} from "react-native";
import { colors, spacing, borderRadii, shadows, typography } from "../theme";

interface PremiumInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  fillWidth?: boolean;
  variant?: "default" | "glass";
}

export const PremiumInput: React.FC<PremiumInputProps> = ({
  label,
  error,
  icon,
  fillWidth = true,
  variant = "default",
  ...textInputProps
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const shadowAnim = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.parallel([
      Animated.timing(focusAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(shadowAnim, {
        toValue: 1.5,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.parallel([
      Animated.timing(focusAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(shadowAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const borderColorInterpolate = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.inputBorder, colors.inputFocus],
  });

  const containerStyle: ViewStyle = {
    width: fillWidth ? "100%" : "auto",
    marginBottom: label ? spacing.md : 0,
  };

  const inputContainerStyle: Animated.WithAnimatedObject<ViewStyle> = {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor:
      variant === "glass"
        ? isFocused
          ? "rgba(139, 92, 246, 0.1)"
          : colors.inputBorder
        : colors.input,
    borderRadius: borderRadii.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: borderColorInterpolate as any,
    transform: [{ scale: isFocused ? 1.02 : 1 }],
    opacity: isFocused ? 1 : 0.95,
    ...(isFocused && shadows.md),
  };

  return (
    <View style={containerStyle}>
      {label && (
        <Text
          style={{
            ...typography.small,
            color: isFocused ? colors.primary : colors.textSecondary,
            marginBottom: spacing.sm,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      )}

      <Animated.View style={inputContainerStyle}>
        {icon && <View style={{ marginRight: spacing.md }}>{icon}</View>}

        <TextInput
          {...textInputProps}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={colors.textTertiary}
          style={{
            flex: 1,
            ...typography.body,
            color: colors.text,
            padding: 0,
          }}
        />
      </Animated.View>

      {error && (
        <Text
          style={{
            ...typography.caption,
            color: colors.error,
            marginTop: spacing.sm,
            marginLeft: spacing.sm,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
};

export default PremiumInput;
