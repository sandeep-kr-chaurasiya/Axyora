/**
 * Icon Components
 * Emoji-based icons for React Native compatibility
 */

import React from "react";
import { Text, View } from "react-native";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Search Icon
export const SearchIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>🔍</Text>
);

// Settings Icon
export const SettingsIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>⚙️</Text>
);

// Menu Icon
export const MenuIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>☰</Text>
);

// Arrow Back Icon
export const ArrowBackIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>←</Text>
);

// Send Icon
export const SendIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>➤</Text>
);

// Image Icon
export const ImageIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>🖼️</Text>
);

// Document Icon
export const DocumentIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>📄</Text>
);

// Video Icon
export const VideoIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>🎥</Text>
);

// Checkmark Icon
export const CheckmarkIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>✓</Text>
);

// Close Icon
export const CloseIcon: React.FC<IconProps> = ({ size = 24 }) => (
  <Text style={{ fontSize: size * 0.9, lineHeight: size }}>✕</Text>
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
