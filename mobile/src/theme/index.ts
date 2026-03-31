/**
 * Theme System Export
 * Central point for all design tokens, colors, animations, and utilities
 */

export { colors } from "./colors";
export { spacing, borderRadii, shadows, glass, typography } from "./spacing";
export { animations, createAnimatedValue, createAnimatedXY, interpolateOpacity, interpolateScale, interpolateTranslateY, interpolateRotate } from "./animations";

// Convenient theme object
import { colors } from "./colors";
import { spacing, borderRadii, shadows, glass, typography } from "./spacing";
import { animations } from "./animations";

export const theme = {
  colors,
  spacing,
  borderRadii,
  shadows,
  glass,
  typography,
  animations,
};

export default theme;
