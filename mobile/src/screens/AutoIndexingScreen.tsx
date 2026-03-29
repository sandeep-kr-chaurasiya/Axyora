import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { AnimatedLogo } from "../components/AnimatedLogo";
import { ProcessTimeline } from "../components/ProcessTimeline";
import type { AutoScanProgress } from "../services/autoScanService";
import { runAutoScan } from "../services/autoScanService";
import type { ScannableFile } from "../services/scannerService";

export function AutoIndexingScreen(props: { onComplete: (files: ScannableFile[]) => void }) {
  const [progress, setProgress] = useState<AutoScanProgress>({
    phase: "images",
    current: 0,
    total: 0,
    status: "scanning",
  });

  const [appended, setAppended] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scannedFiles, setScannedFiles] = useState<ScannableFile[]>([]);

  useEffect(() => {
    const scan = async () => {
      try {
        setAppended([]);
        const files = await runAutoScan(
          (p) => {
            setProgress(p);
            if (p.current > 0 && p.status === "indexing") {
              const msg = `${p.phase}: ${p.current} ${p.phase === "complete" ? "files ready" : "items"}`;
              setAppended((prev) => [...prev, msg]);
            }
          },
          (files) => {
            setScannedFiles(files);
          }
        );
        
        // Auto-transition to next screen after 2 seconds
        setTimeout(() => {
          props.onComplete(files);
        }, 2000);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.warn("Auto scan encountered error, continuing:", errorMsg);
        
        // If auto-scan fails, still allow user to proceed
        // They can manually add files later
        setAppended((prev) => [...prev, `⚠️ Scan had issues, but you can continue - ${errorMsg}`]);
        
        // Continue after 3 seconds even if scan failed
        setTimeout(() => {
          props.onComplete([]);
        }, 3000);
      }
    };

    scan();
  }, []);

  const phaseNames = {
    images: "📸 Scanning Photos & Images",
    audio: "🎵 Scanning Audio & Voice Memos",
    documents: "📄 Scanning Documents",
    complete: "✅ Indexing Complete",
  };

  const phaseDescriptions = {
    images: "Discovering all images and photos on your device...",
    audio: "Finding audio files and voice memos...",
    documents: "Locating documents, PDFs, and text files...",
    complete: "All files indexed! Ready to search.",
  };

  return (
    <LinearGradient colors={["#06070B", "#0D1428", "#071A25"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AnimatedLogo />
          <Text style={styles.title}>Building Your Memory Index</Text>
          <Text style={styles.subtitle}>
            Scanning and indexing all your files locally on your device
          </Text>
        </View>

        {/* Main Progress */}
        <View style={styles.phaseBox}>
          <Text style={styles.phaseName}>{phaseNames[progress.phase]}</Text>
          <Text style={styles.phaseDesc}>{phaseDescriptions[progress.phase]}</Text>

          <View style={styles.progressBar}>
            <View style={styles.progressFill} />
            <ActivityIndicator style={styles.spinner} color={colors.accent} size="small" />
          </View>

          <Text style={styles.phaseCount}>
            {progress.current} {progress.phase === "complete" ? "items" : "items"} {progress.total > 0 ? `of ${progress.total}` : ""}
          </Text>
        </View>

        {/* Status Log */}
        {appended.length > 0 && (
          <View style={styles.statusLog}>
            <Text style={styles.logTitle}>Indexing Progress</Text>
            {appended.map((msg, idx) => (
              <View key={idx} style={styles.logLine}>
                <Text style={styles.logBullet}>✓</Text>
                <Text style={styles.logText}>{msg}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timelineBox}>
          <Text style={styles.timelineTitle}>Process Overview</Text>
          <ProcessTimeline
            steps={[
              { label: "Scan Images", status: progress.phase === "complete" || progress.phase === "images" ? "done" : "pending" },
              { label: "Scan Audio", status: progress.phase === "complete" || progress.phase === "audio" ? (progress.phase !== "complete" ? "active" : "done") : "pending" },
              { label: "Scan Documents", status: progress.phase === "complete" || progress.phase === "documents" ? (progress.phase !== "complete" ? "active" : "done") : "pending" },
              { label: "Ready to Search", status: progress.phase === "complete" ? "done" : "pending" },
            ]}
          />
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoBold}>🔒 Why This Matters</Text>
          <Text style={styles.infoText}>
            We're building a complete index of your files locally. This process only happens once. Afterwards, searching through your memory is instant and private.
          </Text>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Final State */}
        {progress.status === "complete" && (
          <View style={styles.successBox}>
            <Text style={styles.successIcon}>✨</Text>
            <Text style={styles.successText}>Index Ready!</Text>
            <Text style={styles.successSubtext}>Found {scannedFiles.length} items to remember</Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  phaseBox: {
    backgroundColor: "rgba(69, 224, 161, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(69, 224, 161, 0.3)",
    padding: 20,
    marginBottom: 20,
  },
  phaseName: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  phaseDesc: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(69, 224, 161, 0.2)",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
    position: "relative",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
    width: "45%",
  },
  spinner: {
    position: "absolute",
    right: 4,
    top: -6,
  },
  phaseCount: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  statusLog: {
    backgroundColor: "rgba(13, 20, 40, 0.5)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  logTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 10,
  },
  logLine: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  logBullet: {
    color: colors.accent,
    fontWeight: "800",
    marginRight: 8,
  },
  logText: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
  },
  timelineBox: {
    marginBottom: 20,
  },
  timelineTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: "rgba(69, 224, 161, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  infoBold: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 6,
  },
  infoText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: "rgba(255, 70, 70, 0.1)",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: "#FF4646",
  },
  errorText: {
    color: "#FF9999",
    fontSize: 13,
    lineHeight: 18,
  },
  successBox: {
    backgroundColor: "rgba(69, 224, 161, 0.15)",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginTop: 20,
  },
  successIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  successText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 4,
  },
  successSubtext: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
