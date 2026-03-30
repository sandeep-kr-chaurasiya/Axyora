/**
 * Poppins Font System for Axyora
 * Complete typography with unified font family
 */

export const fontFamily = {
  thin: 'Poppins_100Thin',
  extraLight: 'Poppins_200ExtraLight',
  light: 'Poppins_300Light',
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold', 
  bold: 'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
  black: 'Poppins_900Black',
};

// Default fallback for web/unsupported platforms
export const fontFamilyFallback = 'Poppins';

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
// Font loading - fonts will fall back to system fonts if Poppins not available
export const fontsToLoad: Record<string, number> = {};

// Try to load Poppins fonts if they exist
const fontAssets = [
  { name: 'Poppins_100Thin', path: '../../../assets/fonts/Poppins-Thin.ttf' },
  { name: 'Poppins_200ExtraLight', path: '../../../assets/fonts/Poppins-ExtraLight.ttf' },
  { name: 'Poppins_300Light', path: '../../../assets/fonts/Poppins-Light.ttf' },
  { name: 'Poppins_400Regular', path: '../../../assets/fonts/Poppins-Regular.ttf' },
  { name: 'Poppins_500Medium', path: '../../../assets/fonts/Poppins-Medium.ttf' },
  { name: 'Poppins_600SemiBold', path: '../../../assets/fonts/Poppins-SemiBold.ttf' },
  { name: 'Poppins_700Bold', path: '../../../assets/fonts/Poppins-Bold.ttf' },
  { name: 'Poppins_800ExtraBold', path: '../../../assets/fonts/Poppins-ExtraBold.ttf' },
  { name: 'Poppins_900Black', path: '../../../assets/fonts/Poppins-Black.ttf' },
];

// Note: Font files should be placed in assets/fonts/ for production
// For now, app will use system fonts as fallback
