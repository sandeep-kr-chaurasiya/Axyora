import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { requestScanPermissions } from "../services/scannerService";
import { colors } from "../theme/colors";

export function EnhancedPermissionsScreen(props: { onGranted: () => void }) {
  const [loading, setLoading] = useState(false);
  const [grantedPerms, setGrantedPerms] = useState({
    mediaGranted: false,
  });

  const request = async () => {
    setLoading(true);
    const perms = await requestScanPermissions();
    setGrantedPerms(perms);
    
    if (perms.mediaGranted) {
      // Small delay to let user see the checkmark
      setTimeout(() => {
        props.onGranted();
      }, 800);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Permissions</Text>
      <Text style={styles.copy}>
        Axyora needs permission to scan and index your private files locally on your device.
      </Text>

      {/* Permission Breakdown */}
      <View style={styles.permissionsBox}>
        <View style={styles.permissionRow}>
          <View style={styles.permissionLeft}>
            <Text style={styles.permissionEmoji}>🖼️</Text>
            <View>
              <Text style={styles.permissionTitle}>Photo Library</Text>
              <Text style={styles.permissionDetail}>Read all images</Text>
            </View>
          </View>
          {grantedPerms.mediaGranted && <Text style={styles.checkmark}>✓</Text>}
        </View>

        <View style={styles.divider} />

        <View style={styles.permissionRow}>
          <View style={styles.permissionLeft}>
            <Text style={styles.permissionEmoji}>🎵</Text>
            <View>
              <Text style={styles.permissionTitle}>Audio Files</Text>
              <Text style={styles.permissionDetail}>Read audio & voice memos</Text>
            </View>
          </View>
          {grantedPerms.mediaGranted && <Text style={styles.checkmark}>✓</Text>}
        </View>

        <View style={styles.divider} />

        <View style={styles.permissionRow}>
          <View style={styles.permissionLeft}>
            <Text style={styles.permissionEmoji}>📄</Text>
            <View>
              <Text style={styles.permissionTitle}>Documents</Text>
              <Text style={styles.permissionDetail}>Read PDFs, Word docs, text files</Text>
            </View>
          </View>
          {grantedPerms.mediaGranted && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </View>

      {/* Privacy Note */}
      <View style={styles.privacyBox}>
        <Text style={styles.privacyIcon}>🔒</Text>
        <Text style={styles.privacyText}>
          All files stay on your device. We only scan files <Text style={styles.bold}>you have access to</Text>.
        </Text>
      </View>

      {/* Button */}
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={request}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#072117" size="small" />
        ) : (
          <Text style={styles.buttonText}>
            {grantedPerms.mediaGranted ? "✓ Permissions Granted" : "Grant Permissions"}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>
        You can change these permissions anytime in Settings → Privacy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 60,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  copy: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionsBox: {
    backgroundColor: "rgba(69, 224, 161, 0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(69, 224, 161, 0.2)",
    overflow: "hidden",
    marginBottom: 20,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  permissionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  permissionEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  permissionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
    marginBottom: 3,
  },
  permissionDetail: {
    color: colors.textMuted,
    fontSize: 13,
  },
  checkmark: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 24,
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(69, 224, 161, 0.1)",
    marginHorizontal: 14,
  },
  privacyBox: {
    backgroundColor: "rgba(69, 224, 161, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    marginBottom: 28,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  privacyIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  privacyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  bold: {
    color: colors.text,
    fontWeight: "700",
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#072117",
    fontWeight: "800",
    fontSize: 16,
  },
  footer: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
});
