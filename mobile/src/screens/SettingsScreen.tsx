import React, { useState, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
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
import { spacing, borderRadii, shadows } from "../theme/spacing";
import { typography, fontFamily } from "../theme/fonts";
import { useAuth } from "../hooks/useAuth";
import { getSettings, updateSettings, clearIndex } from "../services/apiClient";
import { CloseIcon } from "../components/Icons";

export function SettingsScreen(props: {
  onReindex?: () => void;
  onViewIndexing?: () => void;
  onClearData?: () => void;
  onLogout?: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [storageOptimization, setStorageOptimization] = useState(true);
  const [backgroundProcessing, setBackgroundProcessing] = useState(true);
  const [autoIndex, setAutoIndex] = useState(true);
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);
  const [biometricLock, setBiometricLock] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [stats, setStats] = useState({
    pending: 0,
  });
  const [settingsLoading, setSettingsLoading] = useState(false);

  useEffect(() => {
    setStats({ pending: 0 });
  }, [user?.uid]);

  useEffect(() => {
    const loadSettings = async () => {
      setSettingsLoading(true);
      try {
        const data = await getSettings();
        if (typeof data?.storageOptimization === "boolean") setStorageOptimization(data.storageOptimization);
        if (typeof data?.backgroundProcessing === "boolean") setBackgroundProcessing(data.backgroundProcessing);
        if (typeof data?.autoIndex === "boolean") setAutoIndex(data.autoIndex);
        if (typeof data?.lowPowerMode === "boolean") setLowPowerMode(data.lowPowerMode);
        if (typeof data?.encryptionEnabled === "boolean") setEncryptionEnabled(data.encryptionEnabled);
        if (typeof data?.biometricLock === "boolean") setBiometricLock(data.biometricLock);
      } catch (e) {
} finally {
        setSettingsLoading(false);
      }
    };
    void loadSettings();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      setStats({ pending: 0 });
    }, [])
  );

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
              await clearIndex();
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
              await fetch("http://localhost:8000/session/end", { method: "POST" });
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

  const handlePrivacyPolicy = () => Linking.openURL("https://axyora.ai/privacy");
  const handleTermsOfService = () => Linking.openURL("https://axyora.ai/terms");

  const persistSetting = async (key: string, value: boolean, rollback: () => void) => {
    try {
      await updateSettings({ [key]: value });
    } catch (e) {
rollback();
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <LinearGradient
        colors={[colors.backgroundAlt, colors.background, colors.backgroundTertiary]}
        style={styles.container}
      >
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { fontFamily: fontFamily.black }]}>Settings</Text>
              <Text style={[styles.subtitle, { fontFamily: fontFamily.regular }]}>System control & monitoring</Text>
            </View>
            <TouchableOpacity onPress={props.onClose} style={styles.closeButton}>
              <CloseIcon size={16} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>Data Management</Text>
            <SettingRow title="Re-index All Files" subtitle="Scan for new files" onPress={props.onReindex} />
            <SettingRow title="View Processing Queue" subtitle="See live indexing status" onPress={props.onViewIndexing} />
            <SettingRow
              title="Clear Cache"
              subtitle="Remove temporary files"
              onPress={handleClearData}
              loading={clearing}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>Performance</Text>
            <ToggleRow
              title="Storage Optimization"
              value={storageOptimization}
              onChange={(value) => {
                const prev = storageOptimization;
                setStorageOptimization(value);
                void persistSetting("storageOptimization", value, () => setStorageOptimization(prev));
              }}
              disabled={settingsLoading}
            />
            <ToggleRow
              title="Background Processing"
              value={backgroundProcessing}
              onChange={(value) => {
                const prev = backgroundProcessing;
                setBackgroundProcessing(value);
                void persistSetting("backgroundProcessing", value, () => setBackgroundProcessing(prev));
              }}
              disabled={settingsLoading}
            />
            <ToggleRow
              title="Auto-Index New Files"
              value={autoIndex}
              onChange={(value) => {
                const prev = autoIndex;
                setAutoIndex(value);
                void persistSetting("autoIndex", value, () => setAutoIndex(prev));
              }}
              disabled={settingsLoading}
            />
            <ToggleRow
              title="Low Power Mode"
              value={lowPowerMode}
              onChange={(value) => {
                const prev = lowPowerMode;
                setLowPowerMode(value);
                void persistSetting("lowPowerMode", value, () => setLowPowerMode(prev));
              }}
              disabled={settingsLoading}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>Privacy & Security</Text>
            <ToggleRow
              title="Local Encryption"
              value={encryptionEnabled}
              onChange={(value) => {
                const prev = encryptionEnabled;
                setEncryptionEnabled(value);
                void persistSetting("encryptionEnabled", value, () => setEncryptionEnabled(prev));
              }}
              disabled={settingsLoading}
            />
            <ToggleRow
              title="Biometric Lock"
              value={biometricLock}
              onChange={(value) => {
                const prev = biometricLock;
                setBiometricLock(value);
                void persistSetting("biometricLock", value, () => setBiometricLock(prev));
              }}
              disabled={settingsLoading}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>Privacy & Legal</Text>
            <SettingRow title="Privacy Policy" subtitle="Read policies" onPress={handlePrivacyPolicy} />
            <SettingRow title="Terms of Service" subtitle="View terms" onPress={handleTermsOfService} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>App Version</Text>
              <Text style={styles.metaValue}>1.0.0</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>Account</Text>
            <View style={styles.accountRow}>
              <Text style={styles.accountEmail}>{user?.email || "local@axyora.ai"}</Text>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
              {loggingOut ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.logoutText}>Sign Out</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </LinearGradient>

    </SafeAreaView>
  );
}

function SettingRow(props: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={props.onPress} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.rowSubtitle}>{props.subtitle}</Text> : null}
      </View>
      {props.loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={styles.rowArrow}>›</Text>
      )}
    </TouchableOpacity>
  );
}

function ToggleRow(props: { title: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.rowTitle}>{props.title}</Text>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        disabled={props.disabled}
        thumbColor={props.value ? colors.accent : "#555"}
        trackColor={{ false: "#222", true: "rgba(16, 185, 129, 0.4)" }}
      />
    </View>
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
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  subtitle: {
    ...typography.body3,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardGlass,
  },
  closeText: {
    color: colors.text,
    fontSize: 18,
  },
  statsCard: {
    backgroundColor: colors.cardGlass,
    borderRadius: borderRadii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.label2,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.surfaceGlass,
    paddingVertical: spacing.md,
    borderRadius: borderRadii.lg,
    alignItems: "center",
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  statsActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  inlineButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surfaceGlass,
  },
  inlineText: {
    ...typography.body3,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLeft: {
    flex: 1,
  },
  rowTitle: {
    ...typography.body2,
    color: colors.text,
  },
  rowSubtitle: {
    ...typography.body3,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowArrow: {
    color: colors.textSecondary,
    fontSize: 18,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  metaLabel: {
    ...typography.body3,
    color: colors.textMuted,
  },
  metaValue: {
    ...typography.body3,
    color: colors.text,
  },
  accountRow: {
    paddingVertical: spacing.sm,
  },
  accountEmail: {
    ...typography.body2,
    color: colors.text,
  },
  logoutButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadii.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    ...shadows.md,
  },
  logoutText: {
    ...typography.buttonLarge,
    color: colors.textInverse,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.cardGlass,
    borderRadius: borderRadii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  modalText: {
    ...typography.body3,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  modalButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadii.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  modalButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
});
