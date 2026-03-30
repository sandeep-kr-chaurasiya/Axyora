// components/Button.tsx

import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import { colors } from "../theme/colors";
import { spacing, typography } from "../theme/spacing";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
  fullWidth = false,
}) => {
  const isDisabled = disabled || loading;

  const buttonStyle = [
    styles.button,
    styles[`size_${size}`],
    styles[`variant_${variant}`],
    isDisabled && styles.disabled,
    fullWidth && styles.fullWidth,
    style,
  ];

  const textStyleComputed = [
    styles.text,
    styles[`text_${size}`],
    styles[`text_${variant}`],
    isDisabled && styles.textDisabled,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={isDisabled ? 1 : 0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.text : colors.accent}
          size={size === "sm" ? "small" : "large"}
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={textStyleComputed}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: spacing.lg,
    gap: spacing.sm,
  },
  size_sm: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  size_md: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  size_lg: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },

  // Variants
  variant_primary: {
    backgroundColor: colors.accent,
  },
  variant_secondary: {
    backgroundColor: colors.backgroundTertiary,
  },
  variant_outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  variant_ghost: {
    backgroundColor: "transparent",
  },

  disabled: {
    opacity: 0.5,
  },
  fullWidth: {
    alignSelf: "stretch",
  },

  // Text variants
  text: {
    fontWeight: "600",
    textAlign: "center",
  },
  text_sm: {
    fontSize: 14,
  },
  text_md: {
    fontSize: 16,
  },
  text_lg: {
    fontSize: 18,
  },

  text_primary: {
    color: colors.text,
  },
  text_secondary: {
    color: colors.text,
  },
  text_outline: {
    color: colors.accent,
  },
  text_ghost: {
    color: colors.accent,
  },
  textDisabled: {
    opacity: 0.5,
  },
});
