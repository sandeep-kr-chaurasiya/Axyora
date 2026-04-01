import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Image } from "react-native";

import { colors } from "../theme/colors";

export function AnimatedLogo() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.95] });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.ring, { opacity: glow, transform: [{ scale }] }]} />
      <View style={styles.core}>
        <Image
          source={require("../../Axyora transparent .png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 130,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 2,
    borderColor: colors.accentAlt,
    shadowColor: colors.accentAlt,
    shadowOpacity: 0.8,
    shadowRadius: 18,
  },
  core: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#0A1021",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 46,
    height: 46,
  },
});
