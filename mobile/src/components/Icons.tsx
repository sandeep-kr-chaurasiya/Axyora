/**
 * Icon Components
 * Minimal line icons built from Views (no emoji).
 */

import React from "react";
import { View, StyleSheet } from "react-native";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const Line = ({ width, height, color }: { width: number; height: number; color: string }) => (
  <View style={{ width, height, backgroundColor: color, borderRadius: height / 2 }} />
);

// Search Icon (circle + handle)
export const SearchIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View style={{ width: size, height: size }}>
    <View
      style={{
        width: size * 0.6,
        height: size * 0.6,
        borderRadius: size * 0.3,
        borderWidth: strokeWidth,
        borderColor: color,
        position: "absolute",
        top: 0,
        left: 0,
      }}
    />
    <View
      style={{
        width: size * 0.32,
        height: strokeWidth,
        backgroundColor: color,
        position: "absolute",
        right: 0,
        bottom: 0,
        transform: [{ rotate: "45deg" }],
        borderRadius: strokeWidth / 2,
      }}
    />
  </View>
);

// Settings Icon
export const SettingsIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View style={{ width: size, height: size, justifyContent: "center", gap: 4 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Line width={size * 0.55} height={strokeWidth} color={color} />
      <View
        style={{
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: size * 0.09,
          borderWidth: strokeWidth,
          borderColor: color,
        }}
      />
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: size * 0.09,
          borderWidth: strokeWidth,
          borderColor: color,
        }}
      />
      <Line width={size * 0.55} height={strokeWidth} color={color} />
    </View>
  </View>
);

// Menu Icon
export const MenuIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View style={{ width: size, height: size, justifyContent: "center", gap: 4 }}>
    <Line width={size} height={strokeWidth} color={color} />
    <Line width={size * 0.8} height={strokeWidth} color={color} />
    <Line width={size * 0.6} height={strokeWidth} color={color} />
  </View>
);

// Arrow Back Icon
export const ArrowBackIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View style={{ width: size, height: size, justifyContent: "center" }}>
    <Line width={size * 0.7} height={strokeWidth} color={color} />
    <View
      style={{
        width: size * 0.3,
        height: size * 0.3,
        borderLeftWidth: strokeWidth,
        borderBottomWidth: strokeWidth,
        borderColor: color,
        position: "absolute",
        left: 0,
        transform: [{ rotate: "45deg" }],
      }}
    />
  </View>
);

// Send Icon
export const SendIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: size * 0.28,
        borderBottomWidth: size * 0.28,
        borderLeftWidth: size * 0.5,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        borderLeftColor: color,
      }}
    />
  </View>
);

// Image Icon
export const ImageIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View
    style={{
      width: size,
      height: size,
      borderWidth: strokeWidth,
      borderColor: color,
      borderRadius: 4,
      justifyContent: "flex-end",
      padding: 3,
    }}
  >
    <View
      style={{
        width: size * 0.4,
        height: strokeWidth,
        backgroundColor: color,
        borderRadius: strokeWidth / 2,
      }}
    />
  </View>
);

// Document Icon
export const DocumentIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View
    style={{
      width: size,
      height: size,
      borderWidth: strokeWidth,
      borderColor: color,
      borderRadius: 4,
    }}
  />
);

// Video Icon
export const VideoIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View
    style={{
      width: size,
      height: size,
      borderWidth: strokeWidth,
      borderColor: color,
      borderRadius: 4,
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: size * 0.2,
        borderBottomWidth: size * 0.2,
        borderLeftWidth: size * 0.28,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        borderLeftColor: color,
        marginLeft: 2,
      }}
    />
  </View>
);

// Checkmark Icon
export const CheckmarkIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
    <View
      style={{
        width: size * 0.5,
        height: size * 0.25,
        borderLeftWidth: strokeWidth,
        borderBottomWidth: strokeWidth,
        borderColor: color,
        transform: [{ rotate: "-45deg" }],
      }}
    />
  </View>
);

// Close Icon
export const CloseIcon: React.FC<IconProps> = ({ size = 24, color = "#fff", strokeWidth = 2 }) => (
  <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
    <View
      style={{
        width: size * 0.7,
        height: strokeWidth,
        backgroundColor: color,
        position: "absolute",
        transform: [{ rotate: "45deg" }],
        borderRadius: strokeWidth / 2,
      }}
    />
    <View
      style={{
        width: size * 0.7,
        height: strokeWidth,
        backgroundColor: color,
        position: "absolute",
        transform: [{ rotate: "-45deg" }],
        borderRadius: strokeWidth / 2,
      }}
    />
  </View>
);

export default {
  SearchIcon,
  SettingsIcon,
  MenuIcon,
  ArrowBackIcon,
  SendIcon,
  ImageIcon,
  DocumentIcon,
  VideoIcon,
  CheckmarkIcon,
  CloseIcon,
};
