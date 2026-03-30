import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import { persistentQueue, type QueueItem } from "../services/persistentQueue";
import { pickDocuments, scanDeviceFiles, type ScanProgress } from "../services/scannerService";
import { colors } from "../theme/colors";
import { fontFamily, typography } from "../theme/fonts";
import { checkEngineHealth, getResolvedApiBaseUrl, getFileTypeStats, type FileTypeStats } from "../services/apiClient";
import { useAuth } from "../hooks/useAuth";
import { RealTimeImageProcessor, type ProcessingImageData } from "../components/RealTimeImageProcessor";
import { FailedFilesManager, type FailedFile } from "../components/FailedFilesManager";

const statusColors: Record<string, string> = {
  pending: colors.textMuted,
  uploading: colors.accentLight,
  processing: colors.warning,
  extracting: colors.accentLight,
  indexing: colors.accent,
  done: colors.success,
  error: colors.danger,
  retrying: colors.warning,
};

export function ProcessingScreen(props: { onDone: () => void }) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState(persistentQueue.getStats());
  const [isScanning, setIsScanning] = useState(false);
  const [localScanProgress, setLocalScanProgress] = useState<ScanProgress | null>(null);
  const [engineStatus, setEngineStatus] = useState<"checking" | "online" | "offline">("checking");
  const [engineBaseUrl, setEngineBaseUrl] = useState(getResolvedApiBaseUrl());
  const [fileTypeStats, setFileTypeStats] = useState<FileTypeStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "failing">("overview");
  const hasAutoStarted = useRef(false);

  // Convert QueueItems to ProcessingImageData for display
  const processingImages: ProcessingImageData[] = useMemo(() => {
    return history.map(item => ({
      id: item.id,
      uri: item.file.uri || "",
      name: item.file.name,
      status: (item.status as any) || "pending",
      progress: item.progress || 0,
      fileSize: item.file.size,
      error: item.error?.message,
      details: {
        caption: item.currentStep,
        timeTaken: item.processingTime,
      },
    }));
  }, [history]);

  const failedFiles: FailedFile[] = useMemo(() => {
    return history
      .filter(i => i.status === "error")
      .map(item => ({
        id: item.id,
        name: item.file.name,
        path: item.file.uri || "",
        fileType: (item.file.type || "document") as any,
        fileSize: item.file.size,
        error: item.error?.message || "Unknown error",
        failedAt: item.failedAt || Date.now(),
        retryCount: item.retryCount || 0,
      }));
  }, [history]);

  const currentProcessing = useMemo(
    () => processingImages.find(i => i.status === "uploading" || i.status === "extracting" || i.status === "indexing"),
    [processingImages]
  );

  // 1. Sync Logic
  const sync = useCallback(async () => {
    setHistory(persistentQueue.getHistory(500));
    setStats(persistentQueue.getStats());
  }, []);

  const checkEngine = useCallback(async () => {
    try {
      const ok = await checkEngineHealth();
      setEngineStatus(ok ? "online" : "offline");
    } catch {
      setEngineStatus("offline");
    } finally {
      setEngineBaseUrl(getResolvedApiBaseUrl());
    }
  }, []);

  const loadFileTypeStats = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const stats = await getFileTypeStats(user.uid);
      setFileTypeStats(stats);
    } catch (error) {
      console.warn("[Processing] Failed to load file type stats", error);
    }
  }, [user?.uid]);

  useEffect(() => {
    sync();
    checkEngine();
    loadFileTypeStats();

    const onProgress = () => {
      sync();
      loadFileTypeStats();
    };
    const onCleared = () => sync();

    persistentQueue.on("progress", onProgress);
    persistentQueue.on("cleared", onCleared);
    
    const healthTimer = setInterval(checkEngine, 8000);
    const statsTimer = setInterval(loadFileTypeStats, 5000);

    return () => {
      persistentQueue.off("progress", onProgress);
      persistentQueue.off("cleared", onCleared);
      clearInterval(healthTimer);
      clearInterval(statsTimer);
    };
  }, [sync, checkEngine, loadFileTypeStats]);

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
    await Promise.all([sync(), checkEngine(), loadFileTypeStats()]);
    setRefreshing(false);
  };

  const handleRetryFile = async (fileId: string) => {
    await persistentQueue.retry(fileId);
  };

  const handleRemoveFile = async (fileId: string) => {
    await persistentQueue.remove(fileId);
  };

  const handleRetryAll = async () => {
    await persistentQueue.retryFailed();
  };

  const completionPercentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: fontFamily.black }]}>Memory Indexing</Text>
          <View style={styles.engineRow}>
            <View style={[styles.statusDot, { backgroundColor: engineStatus === "online" ? colors.accent : engineStatus === "checking" ? colors.warning : colors.danger }]} />
            <Text style={[styles.engineText, { fontFamily: fontFamily.semiBold }]}>
              Engine: {engineStatus.toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.engineHint, { fontFamily: fontFamily.regular }]}>{engineBaseUrl}</Text>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "overview" && styles.tabActive]}
            onPress={() => setActiveTab("overview")}
          >
            <Text style={[
              styles.tabText,
              { fontFamily: fontFamily.semiBold },
              activeTab === "overview" && styles.tabTextActive
            ]}>
              📊 Overview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "failing" && styles.tabActive]}
            onPress={() => setActiveTab("failing")}
          >
            <Text style={[
              styles.tabText,
              { fontFamily: fontFamily.semiBold },
              activeTab === "failing" && styles.tabTextActive,
              failedFiles.length > 0 && { color: colors.danger }
            ]}>
              ⚠️ Failed {failedFiles.length > 0 ? `(${failedFiles.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "overview" ? (
          <>
            {/* Overall Stats Card */}
            <View style={styles.statsCard}>
              <View style={styles.statsHeader}>
                <View>
                  <Text style={[styles.statsTitle, { fontFamily: fontFamily.bold }]}>Building Memory</Text>
                  <Text style={[styles.statsSub, { fontFamily: fontFamily.regular }]}>
                    {stats.done} of {stats.total} indexed
                  </Text>
                </View>
                <Text style={[styles.statsPercent, { fontFamily: fontFamily.black }]}>{completionPercentage}%</Text>
              </View>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${completionPercentage}%` }]} />
              </View>

              <View style={styles.miniGrid}>
                <View style={styles.miniItem}>
                  <Text style={[styles.miniVal, { fontFamily: fontFamily.black }]}>{stats.processing}</Text>
                  <Text style={[styles.miniLabel, { fontFamily: fontFamily.semiBold }]}>Processing</Text>
                </View>
                <View style={styles.miniItem}>
                  <Text style={[styles.miniVal, { fontFamily: fontFamily.black }]}>{stats.pending}</Text>
                  <Text style={[styles.miniLabel, { fontFamily: fontFamily.semiBold }]}>Queued</Text>
                </View>
                <View style={styles.miniItem}>
                  <Text style={[styles.miniVal, stats.failed > 0 && { color: colors.danger }, { fontFamily: fontFamily.black }]}>
                    {stats.failed}
                  </Text>
                  <Text style={[styles.miniLabel, { fontFamily: fontFamily.semiBold }]}>Failed</Text>
                </View>
                <View style={styles.miniItem}>
                  <Text style={[styles.miniVal, { fontFamily: fontFamily.black }]}>{stats.done}</Text>
                  <Text style={[styles.miniLabel, { fontFamily: fontFamily.semiBold }]}>Done</Text>
                </View>
              </View>
            </View>

            {/* File Type Stats */}
            {fileTypeStats && fileTypeStats.total > 0 && (
              <View style={styles.fileTypeCard}>
                <Text style={[styles.fileTypeTitle, { fontFamily: fontFamily.bold }]}>📊 Files by Type</Text>
                <View style={styles.fileTypeGrid}>
                  {fileTypeStats.image > 0 && (
                    <View style={styles.fileTypeItem}>
                      <Text style={[styles.fileTypeCount, { fontFamily: fontFamily.black }]}>{fileTypeStats.image}</Text>
                      <Text style={[styles.fileTypeLabel, { fontFamily: fontFamily.regular }]}>📸 Images</Text>
                    </View>
                  )}
                  {fileTypeStats.audio > 0 && (
                    <View style={styles.fileTypeItem}>
                      <Text style={[styles.fileTypeCount, { fontFamily: fontFamily.black }]}>{fileTypeStats.audio}</Text>
                      <Text style={[styles.fileTypeLabel, { fontFamily: fontFamily.regular }]}>🎵 Audio</Text>
                    </View>
                  )}
                  {fileTypeStats.video > 0 && (
                    <View style={styles.fileTypeItem}>
                      <Text style={[styles.fileTypeCount, { fontFamily: fontFamily.black }]}>{fileTypeStats.video}</Text>
                      <Text style={[styles.fileTypeLabel, { fontFamily: fontFamily.regular }]}>🎬 Videos</Text>
                    </View>
                  )}
                  {fileTypeStats.document > 0 && (
                    <View style={styles.fileTypeItem}>
                      <Text style={[styles.fileTypeCount, { fontFamily: fontFamily.black }]}>{fileTypeStats.document}</Text>
                      <Text style={[styles.fileTypeLabel, { fontFamily: fontFamily.regular }]}>📄 Docs</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity 
                style={[styles.btn, styles.btnSecondary, isScanning && { opacity: 0.5 }]} 
                onPress={scanNow}
                disabled={isScanning}
              >
                <Text style={[styles.btnText, { fontFamily: fontFamily.bold }]}>🔄 Re-scan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={manualPick}>
                <Text style={[styles.btnText, { fontFamily: fontFamily.bold }]}>📁 Add Files</Text>
              </TouchableOpacity>
            </View>

            {isScanning && localScanProgress && (
              <View style={styles.scanAlert}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={[styles.scanAlertText, { fontFamily: fontFamily.regular }]}>
                  {localScanProgress.phase === 'scanning_images' ? 'Scanning Photos' : 
                   localScanProgress.phase === 'scanning_audio' ? 'Scanning Audio' : 'Searching Docs'}: {localScanProgress.current} found...
                </Text>
              </View>
            )}

            {/* Real-time Image Processing */}
            {processingImages.length > 0 && (
              <View style={styles.realTimeSection}>
                <RealTimeImageProcessor
                  images={processingImages}
                  currentProcessing={currentProcessing}
                  totalProgress={completionPercentage}
                />
              </View>
            )}

            {/* Recent Log */}
            <View style={styles.logSection}>
              <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>Recent Activity</Text>
              {history.length > 0 ? history.slice(0, 15).map(i => (
                <View key={i.id} style={styles.logRow}>
                  <View style={[styles.logIndicator, { backgroundColor: statusColors[i.status] }]} />
                  <Text style={[styles.logFile, { fontFamily: fontFamily.medium }]} numberOfLines={1}>{i.file.name}</Text>
                  <Text style={[styles.logStatus, { fontFamily: fontFamily.semiBold }, { color: statusColors[i.status] }]}>
                    {i.status}
                  </Text>
                </View>
              )) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>🧬</Text>
                  <Text style={[styles.emptyText, { fontFamily: fontFamily.semiBold }]}>Ready to Index</Text>
                </View>
              )}
            </View>

            {/* Launch Button */}
            <TouchableOpacity 
              style={[styles.launchBtn, stats.done === 0 && { opacity: 0.3 }]} 
              onPress={props.onDone}
              disabled={stats.done === 0}
            >
              <Text style={[styles.launchText, { fontFamily: fontFamily.black }]}>
                {stats.done > 0 ? "💬 Enter Neural Chat" : "⌛ Consolidating Memory..."}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          // Failed Files Tab
          <View style={styles.failedSection}>
            <FailedFilesManager
              failedFiles={failedFiles}
              onRetryFile={handleRetryFile}
              onRemoveFile={handleRemoveFile}
              onRetryAll={handleRetryAll}
            />
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1, paddingHorizontal: 16 },
  header: { marginVertical: 24, marginBottom: 20 },
  title: { fontSize: 32, color: colors.text, letterSpacing: -1, marginBottom: 8 },
  engineRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  engineText: { color: colors.textMuted, fontSize: 12 },
  engineHint: { color: colors.textMuted, fontSize: 11, marginTop: 4, maxWidth: "100%" },
  
  // Tab Navigation
  tabContainer: { flexDirection: "row", gap: 12, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.backgroundTertiary, borderWidth: 1, borderColor: colors.borderLight },
  tabActive: { backgroundColor: colors.accent + "20", borderColor: colors.accent },
  tabText: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  tabTextActive: { color: colors.accent },

  statsCard: { backgroundColor: colors.card, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  statsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  statsTitle: { color: colors.text, fontSize: 16 },
  statsSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  statsPercent: { color: colors.accent, fontSize: 28 },
  progressBar: { height: 8, backgroundColor: colors.backgroundTertiary, borderRadius: 4, overflow: "hidden", marginBottom: 20 },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  miniGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  miniItem: { flex: 1, alignItems: "center", backgroundColor: colors.backgroundTertiary, paddingVertical: 10, borderRadius: 10 },
  miniVal: { color: colors.accent, fontSize: 18 },
  miniLabel: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  fileTypeCard: { backgroundColor: colors.card, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  fileTypeTitle: { color: colors.text, fontSize: 13, marginBottom: 12 },
  fileTypeGrid: { flexDirection: "row", gap: 8 },
  fileTypeItem: { flex: 1, backgroundColor: colors.backgroundTertiary, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  fileTypeCount: { color: colors.accent, fontSize: 16, marginBottom: 2 },
  fileTypeLabel: { color: colors.textMuted, fontSize: 10 },
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnSecondary: { backgroundColor: colors.backgroundTertiary, borderColor: colors.borderLight },
  btnText: { color: colors.text, fontSize: 14 },
  scanAlert: { flexDirection: "row", alignItems: "center", marginBottom: 16, backgroundColor: colors.accent + "15", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.accent + "30" },
  scanAlertText: { color: colors.accent, marginLeft: 8, fontSize: 12 },
  
  realTimeSection: { marginBottom: 20 },
  
  sectionTitle: { color: colors.text, fontSize: 12, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  logSection: { marginBottom: 20 },
  logRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  logIndicator: { width: 6, height: 6, borderRadius: 3, marginRight: 10 },
  logFile: { flex: 1, color: colors.textMuted, fontSize: 12 },
  logStatus: { fontSize: 10 },
  empty: { alignItems: "center", marginVertical: 40, opacity: 0.4 },
  emptyEmoji: { fontSize: 48, marginBottom: 10 },
  emptyText: { color: colors.text },
  launchBtn: { backgroundColor: colors.accent, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 12, shadowColor: colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  launchText: { color: colors.background, fontSize: 16 },

  failedSection: { marginTop: 8, marginBottom: 20 },
});
