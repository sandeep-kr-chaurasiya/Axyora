import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { persistentQueue, type QueueItem } from "../services/persistentQueue";
import { pickDocuments, scanDeviceFiles, type ScanProgress } from "../services/scannerService";
import { colors } from "../theme/colors";
import { getIndexStats } from "../services/apiClient";

const statusColors: Record<string, string> = {
  pending: "#6B7280",
  uploading: "#3B82F6",
  processing: "#F59E0B",
  done: "#10B981",
  error: "#EF4444",
  retrying: "#F59E0B",
};

export function ProcessingScreen(props: { onDone: () => void }) {
  const navigation = useNavigation<any>();
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState(persistentQueue.getStats());
  const [isScanning, setIsScanning] = useState(false);
  const [localScanProgress, setLocalScanProgress] = useState<ScanProgress | null>(null);
  const [engineStatus, setEngineStatus] = useState<"checking" | "online" | "offline">("checking");
  const [refreshing, setRefreshing] = useState(false);
  const hasAutoStarted = useRef(false);

  // 1. Sync Logic
  const sync = useCallback(async () => {
    setHistory(persistentQueue.getHistory(500));
    setStats(persistentQueue.getStats());
  }, []);

  const checkEngine = useCallback(async () => {
    try {
      await getIndexStats();
      setEngineStatus("online");
    } catch (e) {
      setEngineStatus("offline");
    }
  }, []);

  useEffect(() => {
    sync();
    checkEngine();

    const onProgress = () => sync();
    const onCleared = () => sync();

    persistentQueue.on("progress", onProgress);
    persistentQueue.on("cleared", onCleared);
    
    const healthTimer = setInterval(checkEngine, 8000);

    return () => {
      persistentQueue.off("progress", onProgress);
      persistentQueue.off("cleared", onCleared);
      clearInterval(healthTimer);
    };
  }, [sync, checkEngine]);

  // 2. Auto-Scan on mount if empty
  useEffect(() => {
    if (!hasAutoStarted.current && stats.total === 0 && !isScanning) {
      hasAutoStarted.current = true;
      void scanNow();
    }
  }, [stats.total]);

  const scanNow = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setLocalScanProgress(null);
    try {
      const files = await scanDeviceFiles({
        includeImages: true,
        includeAudio: true,
        includeDocuments: true,
        onProgress: (p) => setLocalScanProgress(p),
      });
      if (files.length > 0) {
        persistentQueue.enqueue(files);
      }
    } catch (error) {
      console.error("Scan Error", error);
    } finally {
      setIsScanning(false);
      setLocalScanProgress(null);
    }
  };

  const manualPick = async () => {
    try {
      const docs = await pickDocuments();
      if (docs.length > 0) {
        persistentQueue.enqueue(docs);
      }
    } catch (error) {
      console.error("Picker error", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([sync(), checkEngine()]);
    setRefreshing(false);
  };

  const completionPercentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const currentJob = history.find(i => i.status === "processing" || i.status === "uploading");
  const failedItems = history.filter(i => i.status === "error");

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Neural Matrix</Text>
          <View style={styles.engineRow}>
            <View style={[styles.statusDot, { backgroundColor: engineStatus === "online" ? colors.accent : engineStatus === "checking" ? colors.warning : colors.danger }]} />
            <Text style={styles.engineText}>AI Engine: {engineStatus.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <View>
              <Text style={styles.statsTitle}>Building Memory</Text>
              <Text style={styles.statsSub}>{stats.done} of {stats.total} indexed</Text>
            </View>
            <Text style={styles.statsPercent}>{completionPercentage}%</Text>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completionPercentage}%` }]} />
          </View>

          <View style={styles.miniGrid}>
            <View style={styles.miniItem}>
              <Text style={styles.miniVal}>{stats.processing}</Text>
              <Text style={styles.miniLabel}>Process</Text>
            </View>
            <View style={styles.miniItem}>
              <Text style={styles.miniVal}>{stats.pending}</Text>
              <Text style={styles.miniLabel}>Queued</Text>
            </View>
            <View style={styles.miniItem}>
              <Text style={[styles.miniVal, stats.failed > 0 && { color: colors.danger }]}>{stats.failed}</Text>
              <Text style={styles.miniLabel}>Failed</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={[styles.btn, styles.btnSecondary, isScanning && { opacity: 0.5 }]} 
            onPress={scanNow}
            disabled={isScanning}
          >
            <Text style={styles.btnText}>🔄 Re-scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={manualPick}>
            <Text style={[styles.btnText, { color: "#000" }]}>📁 Add Files</Text>
          </TouchableOpacity>
        </View>

        {isScanning && localScanProgress && (
          <View style={styles.scanAlert}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.scanAlertText}>
              {localScanProgress.phase === 'scanning_images' ? 'Scanning Photos' : 
               localScanProgress.phase === 'scanning_audio' ? 'Scanning Audio' : 'Searching Docs'}: {localScanProgress.current} found...
            </Text>
          </View>
        )}

        {currentJob && (
          <View style={styles.activeSection}>
            <Text style={styles.sectionTitle}>Active Optimization</Text>
            <View style={styles.activeCard}>
              <View style={styles.activeTop}>
                <View style={styles.activeIcon}><Text style={{fontSize: 18}}>📄</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeName} numberOfLines={1}>{currentJob.file.name}</Text>
                  <Text style={[styles.activeStatus, { color: statusColors[currentJob.status] }]}>
                    {currentJob.status.toUpperCase()} • {currentJob.progress}%
                  </Text>
                  <Text style={styles.activeStep}>{currentJob.currentStep}</Text>
                </View>
                <ActivityIndicator color={colors.accent} />
              </View>
              <View style={styles.activeProgress}>
                <View style={[styles.activeFill, { width: `${currentJob.progress}%`, backgroundColor: statusColors[currentJob.status] }]} />
              </View>
            </View>
          </View>
        )}

        {failedItems.length > 0 && (
          <View style={styles.errorSection}>
            <View style={styles.errorHead}>
              <Text style={styles.errorTitle}>Interrupted Units ({failedItems.length})</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => persistentQueue.retryFailed()}>
                <Text style={styles.retryBtnText}>Fix All</Text>
              </TouchableOpacity>
            </View>
            {failedItems.slice(0, 3).map(i => (
              <View key={i.id} style={styles.errorRow}>
                 <Text style={styles.errorFile} numberOfLines={1}>{i.file.name}</Text>
                 <Text style={styles.errorMsg}>{i.error?.message || "Connection failure"}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Neural Trace Log</Text>
          {history.length > 0 ? history.slice(0, 20).map(i => (
            <View key={i.id} style={styles.logRow}>
              <View style={[styles.logIndicator, { backgroundColor: statusColors[i.status] }]} />
              <Text style={styles.logFile} numberOfLines={1}>{i.file.name}</Text>
              <Text style={[styles.logStatus, { color: statusColors[i.status] }]}>{i.status}</Text>
            </View>
          )) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🧬</Text>
              <Text style={styles.emptyText}>Matrix Ready. Initiate Sync.</Text>
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={[styles.launchBtn, stats.done === 0 && { opacity: 0.3 }]} 
          onPress={props.onDone}
          disabled={stats.done === 0}
        >
          <Text style={styles.launchText}>{stats.done > 0 ? "💬 Enter Neural Chat" : "⌛ Consolidating Memory..."}</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { marginVertical: 30 },
  title: { fontSize: 32, fontWeight: "900", color: colors.text, letterSpacing: -1 },
  engineRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  engineText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  statsCard: { backgroundColor: colors.card, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  statsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  statsTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  statsSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  statsPercent: { color: colors.accent, fontSize: 26, fontWeight: "900" },
  progressBar: { height: 8, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden", marginBottom: 20 },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  miniGrid: { flexDirection: "row", justifyContent: "space-between" },
  miniItem: { alignItems: "center" },
  miniVal: { color: colors.text, fontSize: 20, fontWeight: "800" },
  miniLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  actionRow: { flexDirection: "row", gap: 12, marginVertical: 24 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnSecondary: { backgroundColor: colors.backgroundAlt, borderColor: colors.border },
  btnText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  scanAlert: { flexDirection: "row", alignItems: "center", marginBottom: 20, backgroundColor: "rgba(69, 224, 161, 0.1)", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(69, 224, 161, 0.3)" },
  scanAlertText: { color: colors.accent, fontWeight: "700", marginLeft: 10, fontSize: 13 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 },
  activeSection: { marginBottom: 24 },
  activeCard: { backgroundColor: colors.backgroundAlt, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.accent },
  activeTop: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  activeIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  activeName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  activeStatus: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  activeStep: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  activeProgress: { height: 4, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" },
  activeFill: { height: "100%" },
  errorSection: { backgroundColor: "rgba(239, 68, 68, 0.05)", padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.2)" },
  errorHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  errorTitle: { color: colors.danger, fontWeight: "800", fontSize: 14 },
  retryBtn: { backgroundColor: colors.danger, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  retryBtnText: { color: "white", fontWeight: "800", fontSize: 12 },
  errorRow: { marginBottom: 10 },
  errorFile: { color: colors.text, fontWeight: "700", fontSize: 13 },
  errorMsg: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  logSection: { marginBottom: 30 },
  logRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  logIndicator: { width: 6, height: 6, borderRadius: 3, marginRight: 12 },
  logFile: { flex: 1, color: "rgba(255,255,255,0.6)", fontSize: 13 },
  logStatus: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  empty: { alignItems: "center", marginTop: 40, opacity: 0.4 },
  emptyEmoji: { fontSize: 48, marginBottom: 10 },
  emptyText: { color: colors.text, fontWeight: "700" },
  launchBtn: { backgroundColor: colors.accent, paddingVertical: 18, borderRadius: 16, alignItems: "center", marginTop: 10, shadowColor: colors.accent, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 10 },
  launchText: { color: "#000", fontWeight: "900", fontSize: 16 },
});
