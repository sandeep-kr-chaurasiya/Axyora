/**
 * Premium Button Component
 * Glassmorphic design with smooth animations
 */

import React, { useRef } from "react";
import {
  Pressable,
  Text,
  View,
  Animated,
  ViewStyle,
  TextStyle,
  PressableProps,
} from "react-native";
import { colors, spacing, borderRadii, shadows, typography } from "../theme";

interface ButtonProps extends Omit<PressableProps, "children"> {
  children?: React.ReactNode;
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  label,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  loading = false,
  icon,
  iconPosition = "left",
  ...pressableProps
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const variantStyles: Record<string, { bg: string; text: string }> = {
    primary: { bg: colors.primary, text: colors.text },
    secondary: { bg: colors.secondary, text: colors.text },
    outline: { bg: "transparent", text: colors.primary },
    ghost: { bg: "transparent", text: colors.primary },
    danger: { bg: colors.error, text: colors.text },
    success: { bg: colors.success, text: colors.text },
  };

  const sizeStyles: Record<string, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
    sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, fontSize: 14 },
    md: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, fontSize: 16 },
    lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, fontSize: 18 },
  };

  const variantConfig = variantStyles[variant];
  const sizeConfig = sizeStyles[size];

  const handlePressIn = () => {
    if (!disabled && !loading) {
      Animated.spring(scaleAnim, {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    }
  };

  const buttonStyle: Animated.WithAnimatedObject<ViewStyle> = {
    transform: [{ scale: scaleAnim }],
    backgroundColor:
      variant === "ghost" || variant === "outline"
        ? "transparent"
        : disabled
          ? colors.textMuted
          : variantConfig.bg,
    paddingVertical: sizeConfig.paddingVertical,
    paddingHorizontal: sizeConfig.paddingHorizontal,
    borderRadius: borderRadii.lg,
    borderWidth: variant === "ghost" || variant === "outline" ? 1 : 0,
    borderColor: variant === "ghost" || variant === "outline" ? variantConfig.text : "transparent",
    flexDirection: "row" as const,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    ...(variant !== "ghost" && variant !== "outline" && !disabled && shadows.md),
  };

  const textStyle: TextStyle = {
    ...typography.bodyBold,
    color: disabled ? colors.textMuted : variantConfig.text,
    fontSize: sizeConfig.fontSize,
  };

  const displayText = children || label || "";

  return (
    <View style={{ width: fullWidth ? "100%" : "auto", borderRadius: borderRadii.lg, overflow: "hidden" }}>
      <Animated.View style={buttonStyle}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          {...pressableProps}
        >
          {icon && iconPosition === "left" && !loading && icon}
          {loading && <LoadingSpinner size={20} color={variantConfig.text} />}
          {displayText && <Text style={textStyle}>{displayText}</Text>}
          {icon && iconPosition === "right" && !loading && icon}
        </Pressable>
      </Animated.View>
    </View>
  );
};

const LoadingSpinner: React.FC<{ size?: number; color?: string }> = ({ size = 24, color }) => {
  const spinValue = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      })
    ).start();
  }, [spinValue]);

  const rotateInterpolate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: `${color}40`,
        borderTopColor: color,
        transform: [{ rotate: rotateInterpolate }],
      }}
    />
  );
};

export default Button;
