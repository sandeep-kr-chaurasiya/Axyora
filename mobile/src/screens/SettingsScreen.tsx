import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Alert,
  Linking,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { fontFamily } from "../theme/fonts";

export function SettingsScreen(props: {
  onReindex?: () => void;
  onViewIndexing?: () => void;
  onClearData?: () => void;
  onLogout?: () => void;
  onClose: () => void;
}) {
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [storageOptimization, setStorageOptimization] = useState(true);
  const [backgroundProcessing, setBackgroundProcessing] = useState(true);
  const [autoIndex, setAutoIndex] = useState(true);
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);
  const [devMode, setDevMode] = useState(false);
  const [stats, setStats] = useState({
    indexedFiles: 0,
    totalMemorySize: '0 MB',
    processingTime: '0 ms',
  });

  // Simulated stats loading
  useEffect(() => {
    setStats({
      indexedFiles: 247,
      totalMemorySize: '1.2 MB',
      processingTime: '234 ms',
    });
  }, []);

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

  const handleDocumentation = () => {
    Linking.openURL("https://axyora.ai/docs");
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <LinearGradient
        colors={[colors.background, colors.backgroundTertiary]}
        style={styles.container}
      >
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { fontFamily: fontFamily.bold }]}>⚙️ Settings</Text>
            <TouchableOpacity onPress={props.onClose}>
              <Text style={[styles.closeButton, { fontFamily: fontFamily.semiBold }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* System Stats */}
          <View style={styles.statsContainer}>
            <Text style={[styles.statsTitle, { fontFamily: fontFamily.bold }]}>System Status</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { fontFamily: fontFamily.black }]}>{stats.indexedFiles}</Text>
                <Text style={[styles.statLabel, { fontFamily: fontFamily.regular }]}>Files Indexed</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { fontFamily: fontFamily.black }]}>{stats.totalMemorySize}</Text>
                <Text style={[styles.statLabel, { fontFamily: fontFamily.regular }]}>Memory Used</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { fontFamily: fontFamily.black }]}>{stats.processingTime}</Text>
                <Text style={[styles.statLabel, { fontFamily: fontFamily.regular }]}>Avg Speed</Text>
              </View>
            </View>
          </View>

          {/* Indexing Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>📊 Data Management</Text>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={props.onReindex}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuItemIcon}>🔄</Text>
                <View style={styles.menuItemContent}>
                  <Text style={[styles.menuItemTitle, { fontFamily: fontFamily.semiBold }]}>
                    Re-index Data
                  </Text>
                  <Text style={[styles.menuItemDesc, { fontFamily: fontFamily.regular }]}>
                    Scan for new files
                  </Text>
                </View>
              </View>
              <Text style={[styles.menuItemArrow, { fontFamily: fontFamily.bold }]}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={props.onViewIndexing}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuItemIcon}>📈</Text>
                <View style={styles.menuItemContent}>
                  <Text style={[styles.menuItemTitle, { fontFamily: fontFamily.semiBold }]}>
                    Processing Status
                  </Text>
                  <Text style={[styles.menuItemDesc, { fontFamily: fontFamily.regular }]}>
                    View real-time progress
                  </Text>
                </View>
              </View>
              <Text style={[styles.menuItemArrow, { fontFamily: fontFamily.bold }]}>›</Text>
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
                  <Text style={[styles.menuItemTitle, styles.menuItemTitleDanger, { fontFamily: fontFamily.semiBold }]}>
                    Clear All Data
                  </Text>
                  <Text style={[styles.menuItemDesc, { fontFamily: fontFamily.regular }]}>
                    Delete all memories
                  </Text>
                </View>
              </View>
              {clearing ? (
                <ActivityIndicator color={colors.danger} size="small" />
              ) : (
                <Text style={[styles.menuItemArrow, { fontFamily: fontFamily.bold }]}>›</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Performance Settings */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>⚡ Performance</Text>

            <View style={styles.toggleItem}>
              <View style={styles.toggleLeft}>
                <Text style={styles.toggleIcon}>🚀</Text>
                <View>
                  <Text style={[styles.toggleTitle, { fontFamily: fontFamily.semiBold }]}>
                    Storage Optimization
                  </Text>
                  <Text style={[styles.toggleDesc, { fontFamily: fontFamily.regular }]}>
                    Compress indexed data
                  </Text>
                </View>
              </View>
              <Switch
                value={storageOptimization}
                onValueChange={setStorageOptimization}
                trackColor={{ false: colors.borderLight, true: colors.accent + '40' }}
                thumbColor={storageOptimization ? colors.accent : colors.backgroundAlt}
              />
            </View>

            <View style={styles.toggleItem}>
              <View style={styles.toggleLeft}>
                <Text style={styles.toggleIcon}>🔄</Text>
                <View>
                  <Text style={[styles.toggleTitle, { fontFamily: fontFamily.semiBold }]}>
                    Background Processing
                  </Text>
                  <Text style={[styles.toggleDesc, { fontFamily: fontFamily.regular }]}>
                    Index while app is closed
                  </Text>
                </View>
              </View>
              <Switch
                value={backgroundProcessing}
                onValueChange={setBackgroundProcessing}
                trackColor={{ false: colors.borderLight, true: colors.accent + '40' }}
                thumbColor={backgroundProcessing ? colors.accent : colors.backgroundAlt}
              />
            </View>

            <View style={styles.toggleItem}>
              <View style={styles.toggleLeft}>
                <Text style={styles.toggleIcon}>📂</Text>
                <View>
                  <Text style={[styles.toggleTitle, { fontFamily: fontFamily.semiBold }]}>
                    Auto-Index New Files
                  </Text>
                  <Text style={[styles.toggleDesc, { fontFamily: fontFamily.regular }]}>
                    Automatically process additions
                  </Text>
                </View>
              </View>
              <Switch
                value={autoIndex}
                onValueChange={setAutoIndex}
                trackColor={{ false: colors.borderLight, true: colors.accent + '40' }}
                thumbColor={autoIndex ? colors.accent : colors.backgroundAlt}
              />
            </View>
          </View>

          {/* Privacy & Security */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>🔒 Privacy & Security</Text>

            <View style={styles.toggleItem}>
              <View style={styles.toggleLeft}>
                <Text style={styles.toggleIcon}>🔐</Text>
                <View>
                  <Text style={[styles.toggleTitle, { fontFamily: fontFamily.semiBold }]}>
                    Local Encryption
                  </Text>
                  <Text style={[styles.toggleDesc, { fontFamily: fontFamily.regular }]}>
                    Encrypt on-device data
                  </Text>
                </View>
              </View>
              <Switch
                value={encryptionEnabled}
                onValueChange={setEncryptionEnabled}
                trackColor={{ false: colors.borderLight, true: colors.accent + '40' }}
                thumbColor={encryptionEnabled ? colors.accent : colors.backgroundAlt}
              />
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handlePrivacyPolicy}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuItemIcon}>📋</Text>
                <View style={styles.menuItemContent}>
                  <Text style={[styles.menuItemTitle, { fontFamily: fontFamily.semiBold }]}>
                    Privacy Policy
                  </Text>
                  <Text style={[styles.menuItemDesc, { fontFamily: fontFamily.regular }]}>
                    View our data practices
                  </Text>
                </View>
              </View>
              <Text style={[styles.menuItemArrow, { fontFamily: fontFamily.bold }]}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleTermsOfService}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuItemIcon}>⚖️</Text>
                <View style={styles.menuItemContent}>
                  <Text style={[styles.menuItemTitle, { fontFamily: fontFamily.semiBold }]}>
                    Terms of Service
                  </Text>
                  <Text style={[styles.menuItemDesc, { fontFamily: fontFamily.regular }]}>
                    User agreement
                  </Text>
                </View>
              </View>
              <Text style={[styles.menuItemArrow, { fontFamily: fontFamily.bold }]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* About & Help */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>ℹ️ About & Help</Text>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleDocumentation}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuItemIcon}>📖</Text>
                <View style={styles.menuItemContent}>
                  <Text style={[styles.menuItemTitle, { fontFamily: fontFamily.semiBold }]}>
                    Documentation
                  </Text>
                  <Text style={[styles.menuItemDesc, { fontFamily: fontFamily.regular }]}>
                    View guides and tips
                  </Text>
                </View>
              </View>
              <Text style={[styles.menuItemArrow, { fontFamily: fontFamily.bold }]}>›</Text>
            </TouchableOpacity>

            <View style={styles.aboutItem}>
              <Text style={[styles.aboutTitle, { fontFamily: fontFamily.bold }]}>Axyora v1.0.0</Text>
              <Text style={[styles.aboutDesc, { fontFamily: fontFamily.regular }]}>
                Privacy-first AI memory engine. All data stays on your device.
              </Text>
            </View>
          </View>

          {/* Account Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>👤 Account</Text>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              activeOpacity={0.7}
              onPress={handleLogout}
              disabled={loggingOut}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuItemIcon}>🚪</Text>
                <View style={styles.menuItemContent}>
                  <Text style={[styles.menuItemTitle, styles.menuItemTitleDanger, { fontFamily: fontFamily.semiBold }]}>
                    Logout
                  </Text>
                  <Text style={[styles.menuItemDesc, { fontFamily: fontFamily.regular }]}>
                    Exit your account
                  </Text>
                </View>
              </View>
              {loggingOut ? (
                <ActivityIndicator color={colors.danger} size="small" />
              ) : (
                <Text style={[styles.menuItemArrow, { fontFamily: fontFamily.bold }]}>›</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { fontFamily: fontFamily.regular }]}>
              © 2026 Axyora. Privacy-first memory engine.
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 26,
    color: colors.text,
  },
  closeButton: {
    fontSize: 24,
    color: colors.accent,
  },

  // Stats Container
  statsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 18,
    color: colors.accent,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },

  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },

  // Menu Items
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemDanger: {
    backgroundColor: colors.danger + "10",
    borderColor: colors.danger + "30",
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
    color: colors.text,
    fontSize: 13,
  },
  menuItemTitleDanger: {
    color: colors.danger,
  },
  menuItemDesc: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  menuItemArrow: {
    color: colors.accent,
    fontSize: 18,
  },

  // Toggle Items
  toggleItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  toggleIcon: {
    fontSize: 18,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 13,
  },
  toggleDesc: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  // About Item
  aboutItem: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  aboutTitle: {
    color: colors.text,
    fontSize: 13,
    marginBottom: 4,
  },
  aboutDesc: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 16,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
});
