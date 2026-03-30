// components/Input.tsx

import React from "react";
import {
  TextInput,
  View,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
} from "react-native";
import { colors } from "../theme/colors";
import { spacing, typography } from "../theme/spacing";

interface InputProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  secureTextEntry?: boolean;
  style?: TextStyle;
  containerStyle?: ViewStyle;
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  placeholder,
  value,
  onChangeText,
  disabled = false,
  multiline = false,
  numberOfLines = 1,
  keyboardType = "default",
  secureTextEntry = false,
  style,
  containerStyle,
  label,
  error,
  icon,
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          error && styles.inputContainerError,
          disabled && styles.inputContainerDisabled,
        ]}
      >
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <TextInput
          style={[
            styles.input,
            icon ? styles.inputWithIcon : undefined,
            multiline ? styles.inputMultiline : undefined,
            style,
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          selectionColor={colors.accent}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.smallBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundTertiary,
    borderRadius: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  inputContainerError: {
    borderColor: colors.error,
  },
  inputContainerDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    color: colors.text,
    ...typography.body,
    paddingVertical: spacing.md,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  inputMultiline: {
    paddingVertical: spacing.md,
    textAlignVertical: "top",
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },
});
