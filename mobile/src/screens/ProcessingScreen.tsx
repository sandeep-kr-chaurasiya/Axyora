import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { persistentQueue, type QueueItem } from "../services/persistentQueue";
import { pickDocuments, scanDeviceFiles, type ScanProgress } from "../services/scannerService";
import { colors } from "../theme/colors";
import { fontFamily, typography } from "../theme/fonts";
import { spacing, borderRadii, shadows } from "../theme/spacing";
import {
  checkEngineHealth,
  getResolvedApiBaseUrl,
  getFileTypeStats,
  getIndexStats,
  getCurrentProcessing,
  type FileTypeStats,
  type IndexStatsResponse,
  type CurrentProcessingInfo,
} from "../services/apiClient";
import { useAuth } from "../hooks/useAuth";
import { FailedFilesManager, type FailedFile } from "../components/FailedFilesManager";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:           "#0a0a0d",
  surface:      "#111115",
  card:         "#16161b",
  cardBorder:   "rgba(255,255,255,0.06)",
  cardBorderHi: "rgba(255,255,255,0.11)",
  accent:       "#6C6AF6",
  accentDim:    "rgba(108,106,246,0.14)",
  accentGlow:   "rgba(108,106,246,0.35)",
  success:      "#34D399",
  successDim:   "rgba(52,211,153,0.12)",
  warning:      "#FBBF24",
  warningDim:   "rgba(251,191,36,0.12)",
  danger:       "#F87171",
  dangerDim:    "rgba(248,113,113,0.12)",
  text:         "#f0eff8",
  text2:        "#8e8ca8",
  text3:        "#4e4c66",
  mono:         Platform.select({ ios: "Menlo", android: "monospace" }) as string,
} as const;

const statusMeta: Record<string, { color: string; label: string }> = {
  pending:    { color: T.text3,    label: "Pending"    },
  uploading:  { color: T.accent,   label: "Uploading"  },
  processing: { color: T.warning,  label: "Processing" },
  extracting: { color: T.accent,   label: "Extracting" },
  indexing:   { color: "#a78bfa",  label: "Indexing"   },
  done:       { color: T.success,  label: "Done"       },
  error:      { color: T.danger,   label: "Error"      },
  retrying:   { color: T.warning,  label: "Retrying"   },
};

const fileEmoji: Record<string, string> = {
  image: "🖼",
  audio: "🎵",
  video: "🎬",
  document: "📄",
};

// ─── Animated progress bar ────────────────────────────────────────────────────
function ProgressBar({ pct }: { pct: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: pct / 100, useNativeDriver: false, friction: 8 }).start();
  }, [pct]);
  const w = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={pb.track}>
      <Animated.View style={[pb.fill, { width: w }]} />
      <View style={[pb.glow, { opacity: pct > 5 ? 1 : 0 }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 3,
    overflow: "hidden",
    marginVertical: 16,
    position: "relative",
  },
  fill: {
    height: "100%",
    backgroundColor: T.accent,
    borderRadius: 3,
  },
  glow: {
    position: "absolute",
    top: -2,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: T.accentGlow,
    borderRadius: 5,
  },
});

// ─── Stat chip ────────────────────────────────────────────────────────────────
function StatChip({
  value,
  label,
  color = T.text,
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <View style={chip.wrap}>
      <Text style={[chip.value, { color }]}>{value}</Text>
      <Text style={chip.label}>{label}</Text>
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 0.5,
    borderColor: T.cardBorder,
  },
  value: { fontSize: 18, fontWeight: "700", letterSpacing: -0.5 },
  label: { fontSize: 9, color: T.text3, marginTop: 3, letterSpacing: 0.6, textTransform: "uppercase" },
});

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, badge }: { title: string; badge?: string | number }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {badge !== undefined && badge !== "" && (
        <View style={sh.badge}>
          <Text style={sh.badgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  title: { fontSize: 11, color: T.text3, letterSpacing: 0.9, textTransform: "uppercase", fontWeight: "600" },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    backgroundColor: T.dangerDim,
    borderWidth: 0.5,
    borderColor: T.danger,
  },
  badgeText: { fontSize: 9, color: T.danger, fontWeight: "700" },
});

// ─── Engine badge ─────────────────────────────────────────────────────────────
function EngineBadge({ status }: { status: "checking" | "online" | "offline" }) {
  const meta = {
    online:   { color: T.success, bg: T.successDim, label: "Engine online"   },
    offline:  { color: T.danger,  bg: T.dangerDim,  label: "Engine offline"  },
    checking: { color: T.warning, bg: T.warningDim, label: "Checking…"       },
  }[status];
  return (
    <View style={[eb.wrap, { backgroundColor: meta.bg, borderColor: meta.color + "44" }]}>
      <View style={[eb.dot, { backgroundColor: meta.color }]} />
      <Text style={[eb.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}
const eb = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: "600" },
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({
  active,
  failCount,
  onChange,
}: {
  active: "overview" | "failing";
  failCount: number;
  onChange: (t: "overview" | "failing") => void;
}) {
  return (
    <View style={tb.row}>
      {(["overview", "failing"] as const).map((tab) => {
        const isActive = active === tab;
        const isFail   = tab === "failing";
        return (
          <TouchableOpacity
            key={tab}
            style={[tb.tab, isActive && tb.tabActive, isFail && isActive && tb.tabFail]}
            onPress={() => onChange(tab)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                tb.label,
                isActive && tb.labelActive,
                isFail && failCount > 0 && tb.labelFail,
              ]}
            >
              {tab === "overview" ? "Overview" : `Failed${failCount > 0 ? ` (${failCount})` : ""}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const tb = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginBottom: 20 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: T.surface,
    borderWidth: 0.5,
    borderColor: T.cardBorder,
    alignItems: "center",
  },
  tabActive: { backgroundColor: T.accentDim, borderColor: T.accent + "66" },
  tabFail:   { backgroundColor: T.dangerDim, borderColor: T.danger + "66" },
  label:       { fontSize: 12, color: T.text3, fontWeight: "500" },
  labelActive: { color: T.accent, fontWeight: "700" },
  labelFail:   { color: T.danger },
});

// ─── File type mini card ──────────────────────────────────────────────────────
function FileTypeCard({ emoji, count, label }: { emoji: string; count: number; label: string }) {
  return (
    <View style={ftc.wrap}>
      <Text style={ftc.emoji}>{emoji}</Text>
      <Text style={ftc.count}>{count}</Text>
      <Text style={ftc.label}>{label}</Text>
    </View>
  );
}
const ftc = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 0.5,
    borderColor: T.cardBorder,
    gap: 3,
  },
  emoji: { fontSize: 18 },
  count: { fontSize: 16, fontWeight: "700", color: T.accent, letterSpacing: -0.4 },
  label: { fontSize: 9, color: T.text3, letterSpacing: 0.5, textTransform: "uppercase" },
});

// ─── Log row ──────────────────────────────────────────────────────────────────
function LogRow({ item }: { item: QueueItem }) {
  const meta = statusMeta[item.status] ?? { color: T.text3, label: item.status };
  return (
    <View style={lr.row}>
      <View style={[lr.dot, { backgroundColor: meta.color }]} />
      <Text style={lr.name} numberOfLines={1}>{item.file.name}</Text>
      <View style={[lr.badge, { backgroundColor: meta.color + "18", borderColor: meta.color + "44" }]}>
        <Text style={[lr.badgeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
}
const lr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.04)",
    gap: 8,
  },
  dot:  { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  name: { flex: 1, fontSize: 12, color: T.text2, fontWeight: "500" },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  badgeText: { fontSize: 9, fontWeight: "700" },
});

// ─── Queue pill ───────────────────────────────────────────────────────────────
function QueuePill({ item }: { item: QueueItem }) {
  const emoji = fileEmoji[item.file.type ?? "document"] ?? "📄";
  return (
    <View style={qp.wrap}>
      <Text style={qp.emoji}>{emoji}</Text>
      <Text style={qp.name} numberOfLines={1}>{item.file.name}</Text>
    </View>
  );
}
const qp = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 0.5,
    borderColor: T.cardBorder,
    maxWidth: 170,
  },
  emoji: { fontSize: 13 },
  name:  { fontSize: 11, color: T.text2, fontWeight: "500", maxWidth: 110 },
});

// ─── Action button ────────────────────────────────────────────────────────────
function ActionBtn({
  label,
  onPress,
  variant = "secondary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ab.btn, variant === "primary" ? ab.primary : ab.secondary, disabled && ab.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[ab.label, variant === "primary" ? ab.labelPrimary : ab.labelSecondary]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
const ab = StyleSheet.create({
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 0.5,
  },
  primary:      { backgroundColor: T.accent,  borderColor: T.accent   },
  secondary:    { backgroundColor: T.surface, borderColor: T.cardBorderHi },
  disabled:     { opacity: 0.35 },
  label:        { fontSize: 14, fontWeight: "700", letterSpacing: 0.1 },
  labelPrimary: { color: "#fff" },
  labelSecondary: { color: T.text2 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export function ProcessingScreen(props: { onDone: () => void }) {
  const { user } = useAuth();
  const [history,          setHistory]          = useState<QueueItem[]>([]);
  const [stats,            setStats]            = useState(persistentQueue.getStats());
  const [isScanning,       setIsScanning]       = useState(false);
  const [localScanProgress, setLocalScanProgress] = useState<ScanProgress | null>(null);
  const [engineStatus,     setEngineStatus]     = useState<"checking" | "online" | "offline">("checking");
  const [engineBaseUrl,    setEngineBaseUrl]    = useState(getResolvedApiBaseUrl());
  const [fileTypeStats,    setFileTypeStats]    = useState<FileTypeStats | null>(null);
  const [refreshing,       setRefreshing]       = useState(false);
  const [activeTab,        setActiveTab]        = useState<"overview" | "failing">("overview");
  const [liveProgress,     setLiveProgress]     = useState<{
    id: string;
    file: { name: string; type?: string; uri?: string; mimeType?: string; };
    status: string;
    progress: number;
    step?: string;
  } | null>(null);
  const liveProgressIdRef = useRef<string | null>(null);
  const [currentProcessingData, setCurrentProcessingData] = useState<CurrentProcessingInfo>({
    current_file: null,
    queue_size: 0,
    total_processed: 0,
    total_in_queue: 0,
    total_failed: 0,
  });
  const [indexStats, setIndexStats] = useState<IndexStatsResponse>({
    total_files: 0,
    indexed: 0,
    pending: 0,
    processing: 0,
    failed: 0,
    progress: 0,
  });
  const hasAutoStarted = useRef(false);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const processingImages = useMemo(() =>
    history.map(item => ({
      id:       item.id,
      uri:      item.file.uri || "",
      name:     item.file.name,
      status:   (item.status as any) || "pending",
      progress: item.progress || 0,
      fileSize: item.file.size,
      error:    item.error?.message,
      details:  { caption: item.currentStep, timeTaken: item.processingTime },
    })),
  [history]);

  const failedFiles: FailedFile[] = useMemo(() =>
    history
      .filter(i => i.status === "error")
      .map(item => ({
        id:        item.id,
        name:      item.file.name,
        path:      item.file.uri || "",
        fileType:  (item.file.type || "document") as any,
        fileSize:  item.file.size,
        error:     item.error?.message || "Unknown error",
        failedAt:  item.failedAt || Date.now(),
        retryCount: item.retryCount || 0,
      })),
  [history]);

  const localCurrentFile = useMemo(() => {
    const item =
      history.find(i => ["uploading", "processing", "retrying"].includes(i.status)) ||
      history.find(i => i.status === "pending") ||
      null;
    if (!item) return null;
    return {
      job_id: item.jobId || "",
      file_name: item.file.name,
      file_type: item.file.type || "file",
      status: item.status,
      current_step: item.currentStep || "Processing",
      progress: item.progress || 0,
      created_at: item.attemptedAt || item.createdAt,
    };
  }, [history]);

  const liveCurrentFile = useMemo(() => {
    if (!liveProgress?.file?.name) return null;
    return {
      job_id: "",
      file_name: liveProgress.file.name,
      file_type: liveProgress.file.type || "file",
      status: liveProgress.status,
      current_step: liveProgress.step || "Processing",
      progress: liveProgress.progress || 0,
      created_at: Date.now(),
    };
  }, [liveProgress]);

  const displayCurrentFile = liveCurrentFile || localCurrentFile || currentProcessingData.current_file;

  const currentProcessing = useMemo(() => {
    const active = processingImages.find(i =>
      i.status === "uploading" || i.status === "processing" || i.status === "extracting" || i.status === "indexing"
    );
    if (active) return active;
    if (displayCurrentFile?.file_name) {
      const byName = processingImages.find(i => i.name === displayCurrentFile?.file_name);
      if (byName) return byName;
    }
    return null;
  }, [processingImages, displayCurrentFile?.file_name]);
  const currentHistoryItem = useMemo(() => {
    if (!displayCurrentFile?.file_name) return null;
    return history.find(i => i.file?.name === displayCurrentFile.file_name) || null;
  }, [history, displayCurrentFile?.file_name]);

  const displayProgress =
    liveProgress?.progress ??
    currentProcessing?.progress ??
    currentHistoryItem?.progress ??
    displayCurrentFile?.progress ??
    0;

  const currentPreviewUri = useMemo(() => {
    if (currentProcessing?.uri) return currentProcessing.uri;
    if (liveProgress?.file?.uri) return liveProgress.file.uri;
    if (displayCurrentFile?.file_name) {
      const match = history.find(i => i.file?.name === displayCurrentFile.file_name);
      if (match?.file?.uri) return match.file.uri;
    }
    return null;
  }, [currentProcessing?.uri, liveProgress?.file?.uri, displayCurrentFile?.file_name, history]);

  const queuePreview  = useMemo(() =>
    history.filter(i => i.status === "pending" || i.status === "retrying").slice(0, 12),
  [history]);

  const recentActivity = useMemo(() =>
    [...history].slice(-14).reverse(),
  [history]);

  const effectiveStats = useMemo(() => {
    const hasRegistryData =
      indexStats.total_files > 0 ||
      indexStats.indexed > 0 ||
      indexStats.pending > 0 ||
      indexStats.processing > 0 ||
      indexStats.failed > 0;

    if (hasRegistryData) {
      return indexStats;
    }

    const totalFiles = stats.total;
    const indexed = stats.done;
    const pending = stats.pending + stats.retrying;
    const processing = stats.processing;
    const failed = stats.failed;
    const progress = totalFiles > 0 ? Math.round((indexed / totalFiles) * 100) : 0;

    return {
      total_files: totalFiles,
      indexed,
      pending,
      processing,
      failed,
      progress,
    };
  }, [indexStats, stats]);

  const completionPct = effectiveStats.progress;

  // ── Data sync ──────────────────────────────────────────────────────────────
  const sync = useCallback(async () => {
    setHistory(persistentQueue.getHistory(500));
    setStats(persistentQueue.getStats());
  }, []);

  const checkEngine = useCallback(async () => {
    try {
      const ok = await checkEngineHealth();
      setEngineStatus(ok ? "online" : "offline");
    } catch { setEngineStatus("offline"); }
    finally   { setEngineBaseUrl(getResolvedApiBaseUrl()); }
  }, []);

  const loadFileTypeStats = useCallback(async () => {
    if (!user?.uid) return;
    try { setFileTypeStats(await getFileTypeStats(user.uid)); }
    catch (e) {}
  }, [user?.uid]);

  const loadCurrentProcessing = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const data = await getCurrentProcessing(user.uid);
      setCurrentProcessingData(data);
    } catch (e) {
      setCurrentProcessingData({
        current_file: null,
        queue_size: 0,
        total_processed: 0,
        total_in_queue: 0,
        total_failed: 0,
      });
    }
  }, [user?.uid]);

  const loadIndexStats = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const data = await getIndexStats();
      setIndexStats(data);
    } catch {
      setIndexStats({
        total_files: 0,
        indexed: 0,
        pending: 0,
        processing: 0,
        failed: 0,
        progress: 0,
      });
    }
  }, [user?.uid]);

  useEffect(() => {
    sync(); checkEngine(); loadFileTypeStats(); loadCurrentProcessing(); loadIndexStats();
    const onP = (p?: any) => {
      if (p?.file?.name) {
        if (["uploading", "processing", "retrying"].includes(p.status)) {
          liveProgressIdRef.current = p.id;
          setLiveProgress(p);
        } else if (["done", "error"].includes(p.status)) {
          if (liveProgressIdRef.current === p.id) {
            liveProgressIdRef.current = null;
            setLiveProgress(null);
          }
        }
      }
      sync(); loadFileTypeStats(); loadCurrentProcessing(); loadIndexStats();
    };
    const onRegistryStats = (s?: any) => {
      if (!s) return;
      const total = Number(s.total_files || 0);
      const indexed = Number(s.indexed || 0);
      const progress = total > 0 ? Math.round((indexed / total) * 100) : 0;
      setIndexStats({
        total_files: total,
        indexed,
        pending: Number(s.pending || 0),
        processing: Number(s.processing || 0),
        failed: Number(s.failed || 0),
        progress,
      });
    };
    persistentQueue.on("progress", onP);
    persistentQueue.on("registry-stats", onRegistryStats);
    persistentQueue.on("cleared",  sync);
    const t1 = setInterval(checkEngine,           8_000);
    const t2 = setInterval(loadFileTypeStats,     5_000);
    const t3 = setInterval(loadCurrentProcessing, 2_000);
    const t4 = setInterval(loadIndexStats, 3_000);
    return () => {
      persistentQueue.off("progress", onP);
      persistentQueue.off("registry-stats", onRegistryStats);
      persistentQueue.off("cleared",  sync);
      clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4);
    };
  }, [sync, checkEngine, loadFileTypeStats, loadCurrentProcessing, loadIndexStats]);

  useEffect(() => {
    if (!hasAutoStarted.current && indexStats.total_files === 0 && !isScanning) {
      hasAutoStarted.current = true;
      void scanNow();
    }
  }, [indexStats.total_files, isScanning]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const scanNow = async () => {
    if (isScanning) return;
    setIsScanning(true); setLocalScanProgress(null);
    try {
      const files = await scanDeviceFiles({
        includeImages: true, includeAudio: false, includeDocuments: true,
        onProgress: p => setLocalScanProgress(p),
      });
      if (files.length > 0) await persistentQueue.enqueue(files);
    } catch (e) {}
    finally { setIsScanning(false); setLocalScanProgress(null); }
  };

  const manualPick = async () => {
    try {
      const docs = await pickDocuments();
      if (docs.length > 0) await persistentQueue.enqueue(docs);
    } catch (e) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([sync(), checkEngine(), loadFileTypeStats(), loadCurrentProcessing(), loadIndexStats()]);
    setRefreshing(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />
        }
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.title}>Processing Files</Text>
            <Text style={s.subtitle}>{effectiveStats.indexed} of {effectiveStats.total_files} indexed</Text>
          </View>
          <EngineBadge status={engineStatus} />
        </View>

        <Text style={s.engineUrl}>{engineBaseUrl}</Text>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <TabBar active={activeTab} failCount={failedFiles.length} onChange={setActiveTab} />

        {activeTab === "overview" ? (
          <>
            {/* ── Progress card ────────────────────────────────────────── */}
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <View>
                  <Text style={s.cardTitle}>Indexing Progress</Text>
                  <Text style={s.cardSub}>
                    {effectiveStats.processing} Processing · {effectiveStats.pending} queued · {effectiveStats.failed} failed
                  </Text>
                </View>
                <Text style={s.bigPct}>{completionPct}%</Text>
              </View>

              <ProgressBar pct={completionPct} />

              <View style={s.statRow}>
                <StatChip value={effectiveStats.processing} label="Processing" color={T.accent} />
                <StatChip value={effectiveStats.pending} label="Queued" color={T.text2} />
                <StatChip value={effectiveStats.indexed} label="Done" color={T.success} />
                <StatChip value={effectiveStats.failed} label="Failed"
                  color={effectiveStats.failed > 0 ? T.danger : T.text3}
                />
              </View>
            </View>

            {/* ── Scan alert ───────────────────────────────────────────── */}
            {isScanning && localScanProgress && (
              <View style={s.scanBanner}>
                <ActivityIndicator color={T.accent} size="small" />
                <Text style={s.scanBannerText}>
                  {localScanProgress.phase === "scanning_images"
                    ? "Scanning photos"
                    : localScanProgress.phase === "scanning_audio"
                    ? "Scanning audio"
                    : "Searching docs"}{" "}
                  — {localScanProgress.current} found
                </Text>
              </View>
            )}

            {/* ── Current processing file ──────────────────────────────── */}
            {(displayCurrentFile ? (
              <View style={s.card}>
                <View style={s.currentHeader}>
                  <Text style={s.cardTitle}>Now Processing</Text>
                  <View style={[s.statusBadge, { backgroundColor: T.accent + "22" }]}>
                    <View style={[s.statusDot, { backgroundColor: T.accent }]} />
                    <Text style={[s.statusLabel, { color: T.accent }]}>{displayCurrentFile.current_step}</Text>
                  </View>
                </View>
                
                <View style={s.currentRow}>
                  {currentPreviewUri ? (
                    <Image
                      source={{ uri: currentPreviewUri }}
                      style={s.thumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={s.thumbPlaceholder}>
                      <Image
                        source={require("../../Axyora transparent .png")}
                        style={s.thumbLogo}
                        resizeMode="contain"
                      />
                    </View>
                  )}

                  <View style={s.currentInfo}>
                    <Text style={s.fileName} numberOfLines={2}>{displayCurrentFile.file_name}</Text>
                    <View style={s.progressContainer}>
                      <View style={s.seekTrack}>
                        <View style={[s.seekFill, { width: `${Math.min(displayProgress, 100)}%` }]} />
                      </View>
                      <Text style={s.progressPercent}>{Math.round(displayProgress)}% complete</Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.cardTitle}>Now Processing</Text>
                <View style={s.emptyProcessing}>
                  <Text style={s.emptyProcessingText}>Waiting for files to process...</Text>
                </View>
              </View>
            ))}

            {/* ── Recent activity ──────────────────────────────────────── */}
            <View style={s.card}>
              <SectionHeader title="Recent Activity" />
              {recentActivity.length > 0 ? (
                recentActivity.map(item => <LogRow key={item.id} item={item} />)
              ) : (
                <View style={s.emptyState}>
                  <Text style={s.emptyTitle}>Ready to Index</Text>
                  <Text style={s.emptyDesc}>
                    Tap Re-scan to discover files on your device
                  </Text>
                </View>
              )}
            </View>

            {/* ── Actions ──────────────────────────────────────────────── */}
            <View style={s.actionRow}>
              <ActionBtn
                label={isScanning ? "Scanning…" : "Re-scan"}
                onPress={scanNow}
                variant="secondary"
                disabled={isScanning}
              />
              <ActionBtn label="Add Files" onPress={manualPick} variant="secondary" />
            </View>

            {/* ── Launch button ────────────────────────────────────────── */}
            <TouchableOpacity
              style={[s.launchBtn, effectiveStats.indexed === 0 && s.launchBtnOff]}
              onPress={props.onDone}
              disabled={effectiveStats.indexed === 0}
              activeOpacity={0.85}
            >
              <View style={s.launchInner}>
                <Text style={s.launchText}>Enter Neural Chat</Text>
                <Text style={s.launchArrow}>→</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          /* ── Failed tab ─────────────────────────────────────────────── */
          <View style={s.section}>
            <FailedFilesManager
              failedFiles={failedFiles}
              onRetryFile={id => persistentQueue.retry(id)}
              onRemoveFile={id => persistentQueue.remove(id)}
              onRetryAll={async () => { await persistentQueue.retryFailed(); }}
            />
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  // header
  header: {
    marginTop: 20,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flex: 1, marginRight: 12 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: T.text,
    letterSpacing: -0.6,
  },
  subtitle: { fontSize: 12, color: T.text3, marginTop: 3, fontWeight: "400" },
  engineUrl: { fontSize: 10, color: T.text3, marginBottom: 20, fontFamily: T.mono },

  // card
  card: {
    backgroundColor: T.card,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: T.cardBorder,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: T.text,  letterSpacing: -0.1 },
  cardSub:   { fontSize: 11, fontWeight: "400", color: T.text3, marginTop: 3       },
  bigPct:    { fontSize: 28, fontWeight: "800", color: T.accent, letterSpacing: -1  },

  // stat row
  statRow: { flexDirection: "row", gap: 6 },

  // scan banner
  scanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.accentDim,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: T.accent + "44",
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
  },
  scanBannerText: { fontSize: 12, color: T.accent, fontWeight: "500", flex: 1 },

  // file type row
  ftRow: { flexDirection: "row", gap: 6 },

  // queue
  queueScroll: { gap: 7, paddingVertical: 2 },
  queueClear: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(52,211,153,0.08)",
    borderWidth: 0.5,
    borderColor: T.success + "44",
  },
  queueClearText: { fontSize: 12, color: T.success, fontWeight: "500" },

  // empty
  emptyState: { alignItems: "center", paddingVertical: 32 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: T.text2, marginBottom: 5 },
  emptyDesc:  { fontSize: 12, color: T.text3, textAlign: "center", lineHeight: 18 },

  // section wrapper
  section: { marginBottom: 12 },

  // action row
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 12 },

  // launch button
  launchBtn: {
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
    shadowColor: T.accentGlow,
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  launchBtnOff: { opacity: 0.28, shadowOpacity: 0 },
  launchInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  launchText:  { fontSize: 15, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
  launchArrow: { fontSize: 17, color: "rgba(255,255,255,0.7)", fontWeight: "300" },

  // current file card
  currentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: T.accent + "44",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  currentRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  currentInfo: {
    flex: 1,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  thumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: T.cardBorder,
  },
  thumbLogo: {
    width: 28,
    height: 28,
    opacity: 0.9,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: T.text,
    marginBottom: 12,
  },
  progressContainer: {
    gap: 8,
    marginBottom: 12,
  },
  seekTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  seekFill: {
    height: "100%",
    backgroundColor: T.accent,
    borderRadius: 3,
  },
  progressPercent: {
    fontSize: 12,
    color: T.text3,
    fontWeight: "500",
  },
  emptyProcessing: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyProcessingText: {
    fontSize: 13,
    color: T.text3,
    textAlign: "center",
    fontWeight: "500",
  },
});
