// spacing.ts - Premium spacing & design tokens system

import type { TextStyle } from "react-native";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const borderRadii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  glass: 20,
  round: 9999,
};

// Soft shadows for glassmorphic effect
export const shadows = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  xl: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 15,
  },
  glow: {
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};

// Premium glass effects
export const glass = {
  light: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(10px)",
  },
  medium: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    backdropFilter: "blur(20px)",
  },
  dark: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(15px)",
  },
};

type TypographyScale = {
  h1: TextStyle;
  h2: TextStyle;
  h3: TextStyle;
  h4: TextStyle;
  body: TextStyle;
  bodyBold: TextStyle;
  small: TextStyle;
  smallBold: TextStyle;
  caption: TextStyle;
  captionBold: TextStyle;
};

export const typography: TypographyScale = {
  h1: {
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  h4: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  small: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  smallBold: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
    letterSpacing: 0,
  },
  captionBold: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    letterSpacing: 0,
  },
};
