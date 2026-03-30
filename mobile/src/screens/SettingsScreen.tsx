import { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

export function SettingsScreen(props: {
  onReindex?: () => void;
  onViewIndexing?: () => void;
  onClearData?: () => void;
  onLogout?: () => void;
  onClose: () => void;
}) {
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleClearData = () => {
    Alert.alert(
      "Clear All Data",
      "This will delete all indexed files and memories. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            try {
              await props.onClearData?.();
              Alert.alert("Success", "All data cleared");
            } catch (err) {
              Alert.alert("Error", "Failed to clear data");
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout? Your local data will remain secure.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            try {
              await props.onLogout?.();
            } catch (err) {
              Alert.alert("Error", "Failed to logout");
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL("https://axyora.ai/privacy");
  };

  const handleTermsOfService = () => {
    Linking.openURL("https://axyora.ai/terms");
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <LinearGradient
        colors={["#06070B", "#0D1428", "#071A25"]}
        style={styles.container}
      >
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <TouchableOpacity onPress={props.onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Indexing Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={props.onReindex}
          >
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuItemIcon}>🔄</Text>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Re-index Data</Text>
                <Text style={styles.menuItemDesc}>Scan for new files</Text>
              </View>
            </View>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={props.onViewIndexing}
          >
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuItemIcon}>📊</Text>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Indexing Progress</Text>
                <Text style={styles.menuItemDesc}>View processing status</Text>
              </View>
            </View>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemDanger]}
            activeOpacity={0.7}
            onPress={handleClearData}
            disabled={clearing}
          >
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuItemIcon}>🗑️</Text>
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemTitle, styles.menuItemTitleDanger]}>
                  Clear All Data
                </Text>
                <Text style={styles.menuItemDesc}>Delete all memories</Text>
              </View>
            </View>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Legal</Text>

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={handlePrivacyPolicy}
          >
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuItemIcon}>📋</Text>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Privacy Policy</Text>
                <Text style={styles.menuItemDesc}>How we protect your data</Text>
              </View>
            </View>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={handleTermsOfService}
          >
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuItemIcon}>⚖️</Text>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Terms of Service</Text>
                <Text style={styles.menuItemDesc}>User agreement</Text>
              </View>
            </View>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.aboutItem}>
            <Text style={styles.aboutTitle}>Axyora</Text>
            <Text style={styles.aboutVersion}>v1.0.0</Text>
          </View>

          <Text style={styles.aboutDesc}>
            Privacy-first AI memory engine. All data stays on your device.
          </Text>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemDanger]}
            activeOpacity={0.7}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuItemIcon}>🚪</Text>
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemTitle, styles.menuItemTitleDanger]}>
                  Logout
                </Text>
                <Text style={styles.menuItemDesc}>Exit your account</Text>
              </View>
            </View>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 Axyora. All rights reserved.</Text>
        </View>
      </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  closeButton: {
    fontSize: 22,
    color: colors.accent,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    marginBottom: 8,
  },
  menuItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  menuItemIcon: {
    fontSize: 18,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  menuItemTitleDanger: {
    color: "#EF4444",
  },
  menuItemDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuItemArrow: {
    fontSize: 18,
    color: colors.textMuted,
  },
  aboutItem: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
  },
  aboutTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  aboutVersion: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  aboutDesc: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 12,
    paddingHorizontal: 12,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
