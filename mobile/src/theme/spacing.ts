// spacing.ts - Comprehensive spacing system

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
  round: 9999,
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.29,
    shadowRadius: 4.65,
    elevation: 7,
  },
  xl: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
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
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 40,
  },
  h2: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
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
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  small: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },
  smallBold: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  captionBold: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
};
