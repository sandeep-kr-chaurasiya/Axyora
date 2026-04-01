import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { requestAndroidStorageDirectoryAccess, requestScanPermissions } from "../services/scannerService";
import { colors } from "../theme/colors";
import { spacing, borderRadii, shadows } from "../theme/spacing";
import { typography } from "../theme/fonts";

export function EnhancedPermissionsScreen(props: { onGranted: () => void; onSkip?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [grantedPerms, setGrantedPerms] = useState({
    mediaGranted: false,
    runtimeLimited: false,
    storageGranted: false,
  });

  const fullyGranted = useMemo(
    () => grantedPerms.mediaGranted || grantedPerms.storageGranted || grantedPerms.runtimeLimited,
    [grantedPerms]
  );

  useEffect(() => {
    if (!fullyGranted) return;
    const timer = setTimeout(() => props.onGranted(), 600);
    return () => clearTimeout(timer);
  }, [fullyGranted, props]);

  const request = async () => {
    setLoading(true);
    const perms = await requestScanPermissions();
    let storageGranted = false;

    if (Platform.OS === "android") {
      const storage = await requestAndroidStorageDirectoryAccess();
      storageGranted = storage.granted;
    }

    setGrantedPerms({ ...perms, storageGranted });

    if (Platform.OS === "android" && !perms.mediaGranted && !storageGranted && !perms.runtimeLimited) {
      Alert.alert(
        "Permission Needed",
        "Android did not grant storage permissions. Please allow Photos/Media and Files access in App Settings.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ]
      );
    }

    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Text style={styles.iconLabel}>FILES</Text>
        </View>
        <Text style={styles.title}>Enable File Access</Text>
        <Text style={styles.copy}>
          Axyora needs access to your photos and documents to organize and search your memories.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Why we need this</Text>
        <View style={styles.checkRow}>
          <View style={styles.checkDot} />
          <Text style={styles.checkText}>Index your memories privately</Text>
        </View>
        <View style={styles.checkRow}>
          <View style={styles.checkDot} />
          <Text style={styles.checkText}>Search your files instantly</Text>
        </View>
        <View style={styles.checkRow}>
          <View style={styles.checkDot} />
          <Text style={styles.checkText}>Never upload data without consent</Text>
        </View>
      </View>

      <View style={styles.privacyBox}>
        <View style={styles.privacyDot} />
        <Text style={styles.privacyText}>
          All files stay on your device. You’re always in control.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, fullyGranted && styles.buttonGranted, loading && styles.buttonDisabled]}
        onPress={request}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.textInverse} size="small" />
        ) : (
          <Text style={styles.buttonText}>
            {fullyGranted ? "Permissions Granted" : "Grant Access"}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={props.onSkip}>
        <Text style={styles.secondaryText}>Maybe Later</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  iconWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  iconLabel: {
    fontSize: 14,
    letterSpacing: 1.2,
    fontWeight: "700",
    color: colors.accent,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  copy: {
    ...typography.body2,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardTitle: {
    ...typography.label1,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  checkText: {
    ...typography.body2,
    color: colors.text,
  },
  privacyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  privacyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  privacyText: {
    ...typography.body3,
    color: colors.textMuted,
    flex: 1,
  },
  button: {
    height: 52,
    borderRadius: borderRadii.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  buttonGranted: {
    backgroundColor: colors.success,
  },
  buttonText: {
    ...typography.buttonLarge,
    color: colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  secondaryButton: {
    marginTop: spacing.md,
    alignItems: "center",
  },
  secondaryText: {
    ...typography.body3,
    color: colors.textSecondary,
  },
});
