/**
 * Premium Animation System
 * Smooth, subtle animations for glassmorphic UI
 */

import { Animated, Easing } from "react-native";

export const animations = {
  // Timing functions
  timings: {
    fast: 200,
    base: 300,
    slow: 500,
    verySlow: 800,
  },

  // Easing curves
  easings: {
    smooth: Easing.bezier(0.25, 0.46, 0.45, 0.94),
    easeOut: Easing.out(Easing.cubic),
    easeIn: Easing.in(Easing.cubic),
    easeInOut: Easing.inOut(Easing.cubic),
    natural: Easing.bezier(0.4, 0, 0.2, 1),
  },

  // Predefined animation sequences
  fadeIn: (value: Animated.Value, duration = 300) => {
    return Animated.timing(value, {
      toValue: 1,
      duration,
      easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      useNativeDriver: true,
    });
  },

  fadeOut: (value: Animated.Value, duration = 300) => {
    return Animated.timing(value, {
      toValue: 0,
      duration,
      easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      useNativeDriver: true,
    });
  },

  slideUp: (value: Animated.Value, duration = 400) => {
    return Animated.timing(value, {
      toValue: 0,
      duration,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    });
  },

  slideDown: (value: Animated.Value, startValue = -100, duration = 400) => {
    return Animated.timing(value, {
      toValue: startValue,
      duration,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    });
  },

  scale: (value: Animated.Value, targetScale = 1, duration = 300) => {
    return Animated.timing(value, {
      toValue: targetScale,
      duration,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    });
  },

  pulse: (value: Animated.Value) => {
    return Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1.05,
          duration: 500,
          easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 1,
          duration: 500,
          easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
          useNativeDriver: true,
        }),
      ])
    );
  },

  glow: (opacityValue: Animated.Value) => {
    return Animated.loop(
      Animated.sequence([
        Animated.timing(opacityValue, {
          toValue: 0.8,
          duration: 1500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacityValue, {
          toValue: 0.3,
          duration: 1500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
  },

  shake: (translateX: Animated.Value) => {
    return Animated.sequence([
      Animated.timing(translateX, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -5,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]);
  },

  spin: (rotateValue: Animated.Value) => {
    return Animated.loop(
      Animated.timing(rotateValue, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
  },
};

// Helper to create animated values
export function createAnimatedValue(initialValue = 0) {
  return new Animated.Value(initialValue);
}

// Helper to create animated XY values
export function createAnimatedXY() {
  return new Animated.ValueXY({ x: 0, y: 0 });
}

// Interpolation helpers
export function interpolateOpacity(value: Animated.Value) {
  return value.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
}

export function interpolateScale(value: Animated.Value, fromScale = 0.9, toScale = 1) {
  return value.interpolate({
    inputRange: [0, 1],
    outputRange: [fromScale, toScale],
  });
}

export function interpolateTranslateY(value: Animated.Value, fromY = -50, toY = 0) {
  return value.interpolate({
    inputRange: [0, 1],
    outputRange: [fromY, toY],
  });
}

export function interpolateRotate(value: Animated.Value) {
  return value.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
}
