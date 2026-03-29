import { useState, useEffect } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { auth, logout } from "../services/firebase";
import { clearIndex, getIndexStats } from "../services/apiClient";
import { persistentQueue } from "../services/persistentQueue";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PERMISSIONS_KEY = "@axyora/permissions-granted";
const ONBOARDING_KEY = "@axyora/onboarding-complete";
const AUTO_SCAN_KEY = "@axyora_auto_scan_state";

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [user, setUser] = useState(auth.currentUser);
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedModel, setSelectedModel] = useState("llama3:8b");

  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const data = await getIndexStats();
      setStats(data);
    } catch (e) {
      console.warn("Failed to fetch index stats", e);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          // The App component should handle the navigation back to Auth screen automatically 
          // via useAuth hook state change.
        },
      },
    ]);
  };

  const handleClearMemory = async () => {
    Alert.alert(
      "Clear Index",
      "This will remove all indexed vectors from the local AI engine. Your files will NOT be deleted from your device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Everything",
          style: "destructive",
          onPress: async () => {
            setIsClearing(true);
            try {
              await clearIndex();
              await persistentQueue.clear();
              setStats({ total_files: 0, total_vectors: 0, total_chunks: 0 });
              Alert.alert("Success", "Memory index cleared.");
            } catch (e) {
              Alert.alert("Error", "Failed to clear index.");
            } finally {
              setIsClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleReindex = async () => {
    Alert.alert(
      "Re-index All Files",
      "This will clear the current index and start a fresh scan of your device. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Re-index",
          onPress: async () => {
            setIsClearing(true);
            try {
              await clearIndex();
              await persistentQueue.clear();
              
              // Clear scan markers to allow App.tsx/ProcessingScreen to re-trigger scan
              await AsyncStorage.removeItem(AUTO_SCAN_KEY);
              
              // Navigate back to Processing screen to restart scan
              navigation.reset({
                index: 0,
                routes: [{ name: "Processing" }],
              });
            } catch (e) {
              Alert.alert("Error", "Failed to start re-indexing.");
            } finally {
              setIsClearing(false);
            }
          },
        },
      ]
    );
  };

  const openAppPermissions = () => {
    Linking.openSettings();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.emailText}>{user?.email}</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Section */}
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Memory Statistics</Text>
          {isLoadingStats && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statsCard}>
            <Text style={styles.statsVal}>{stats?.total_files ?? 0}</Text>
            <Text style={styles.statsLabel}>Files</Text>
          </View>
          <View style={styles.statsCard}>
            <Text style={styles.statsVal}>{stats?.total_chunks ?? 0}</Text>
            <Text style={styles.statsLabel}>Chunks</Text>
          </View>
          <View style={styles.statsCard}>
            <Text style={styles.statsVal}>{stats?.total_vectors ?? 0}</Text>
            <Text style={styles.statsLabel}>Vectors</Text>
          </View>
        </View>
      </View>

      {/* Model Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Brain Configuration</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Active Model</Text>
              <Text style={styles.settingSub}>Choose your local inference model</Text>
            </View>
            <TouchableOpacity style={styles.modelBtn} disabled>
              <Text style={styles.modelBtnText}>{selectedModel}</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={handleReindex}
            disabled={isClearing}
          >
            <Text style={styles.actionBtnText}>🔄 Trigger Fresh Neural Scan</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionBtn, { marginTop: 12 }]} 
            onPress={handleClearMemory}
            disabled={isClearing}
          >
            <Text style={[styles.actionBtnText, { color: colors.danger }]}>🗑️ Wipe Memory Index</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Permissions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security & Privacy</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Local Encryption</Text>
              <Text style={styles.settingSub}>Secure your vector database with device biometrics</Text>
            </View>
            <Switch value={true} trackColor={{ true: colors.accent, false: colors.border }} />
          </View>
          
          <TouchableOpacity style={styles.outlineBtn} onPress={openAppPermissions}>
            <Text style={styles.outlineBtnText}>Manage System Permissions</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* About Section */}
      <View style={styles.aboutSection}>
        <Text style={styles.versionText}>Axyora Mobile Engine v1.0.4</Text>
        <Text style={styles.privacyNote}>
          Your data never leaves your device. All embeddings and search results are stored and processed locally.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  section: {
    marginBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  emailText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  logoutBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
  logoutText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statsCard: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statsVal: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: "900",
  },
  statsLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  settingLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  settingSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    maxWidth: "80%",
  },
  modelBtn: {
    backgroundColor: "rgba(69, 224, 161, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(69, 224, 161, 0.3)",
  },
  modelBtnText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  actionBtn: {
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  actionBtnText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  outlineBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  outlineBtnText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },
  aboutSection: {
    alignItems: "center",
    marginTop: 20,
  },
  versionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.5,
  },
  privacyNote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
    paddingHorizontal: 40,
    opacity: 0.6,
  },
});
