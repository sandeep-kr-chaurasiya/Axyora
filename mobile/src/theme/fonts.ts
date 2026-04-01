/**
 * Poppins Font System for Axyora
 * Complete typography with unified font family
 */

// Using system fonts as fallback since Poppins font files are not included
// For production, add Poppins TTF files to assets/fonts/ and update these references
import { Platform } from 'react-native';

const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const fontFamily = {
  thin: systemFont,
  extraLight: systemFont,
  light: systemFont,
  regular: systemFont,
  medium: systemFont,
  semiBold: systemFont, 
  bold: systemFont,
  extraBold: systemFont,
  black: systemFont,
};

// Default fallback for web/unsupported platforms
export const fontFamilyFallback = systemFont;

/**
 * Typography presets using Poppins
 */
export const typography = {
  // Display sizes
  display1: {
    fontSize: 48,
    fontWeight: '900' as const,
    lineHeight: 56,
    fontFamily: fontFamily.black,
    letterSpacing: -1.5,
  },
  display2: {
    fontSize: 40,
    fontWeight: '800' as const,
    lineHeight: 48,
    fontFamily: fontFamily.extraBold,
    letterSpacing: -1,
  },

  // Heading sizes
  h1: {
    fontSize: 32,
    fontWeight: '800' as const,
    lineHeight: 40,
    fontFamily: fontFamily.extraBold,
    letterSpacing: -0.8,
  },
  h2: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 36,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.6,
  },
  h3: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.4,
  },
  h4: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
    fontFamily: fontFamily.semiBold,
    letterSpacing: -0.2,
  },

  // Body sizes
  body1: {
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 24,
    fontFamily: fontFamily.medium,
    letterSpacing: 0,
  },
  body2: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 22,
    fontFamily: fontFamily.medium,
    letterSpacing: 0,
  },
  body3: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 20,
    fontFamily: fontFamily.regular,
    letterSpacing: 0,
  },

  // Label/Tag sizes
  label1: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 18,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  label2: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 16,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 0.4,
  },
  label3: {
    fontSize: 10,
    fontWeight: '500' as const,
    lineHeight: 14,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.3,
  },

  // Caption
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: 0,
  },
  captionSmall: {
    fontSize: 11,
    fontWeight: '400' as const,
    lineHeight: 15,
    fontFamily: fontFamily.regular,
    letterSpacing: 0,
  },

  // Button
  button: {
    fontSize: 14,
    fontWeight: '700' as const,
    lineHeight: 20,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
  },
  buttonSmall: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 18,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.4,
  },
  buttonLarge: {
    fontSize: 16,
    fontWeight: '800' as const,
    lineHeight: 24,
    fontFamily: fontFamily.extraBold,
    letterSpacing: 0.5,
  },
};

/**
 * Font loading configuration for Expo
 */
// Using system fonts - font files are not included in the bundle
export const fontsToLoad: Record<string, number> = {};
