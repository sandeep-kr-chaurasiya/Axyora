import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { scanDeviceFiles, type ScanProgress, type ScannableFile } from "../services/scannerService";
import { colors } from "../theme/colors";
import { spacing, borderRadii, shadows } from "../theme/spacing";
import { typography } from "../theme/fonts";

export function DiscoveryScreen(props: {
  onStartProcessing: (files: ScannableFile[]) => void;
  onSkip?: () => void;
}) {
  const [scanning, setScanning] = useState(true);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [files, setFiles] = useState<ScannableFile[]>([]);
  const [counts, setCounts] = useState({ images: 0, documents: 0, audio: 0 });

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const scanned = await scanDeviceFiles({
          includeImages: true,
          includeAudio: true,
          includeDocuments: true,
          onProgress: (p) => {
            if (!alive) return;
            setProgress(p);
            if (p.phase === "scanning_images") {
              setCounts((prev) => ({ ...prev, images: p.current }));
            }
            if (p.phase === "scanning_audio") {
              setCounts((prev) => ({ ...prev, audio: p.current }));
            }
            if (p.phase === "scanning_docs") {
              setCounts((prev) => ({ ...prev, documents: p.current }));
            }
          },
        });
        if (!alive) return;
        setFiles(scanned);
        const finalCounts = scanned.reduce(
          (acc, file) => {
            if (file.type === "image") acc.images += 1;
            if (file.type === "audio") acc.audio += 1;
            if (file.type === "document") acc.documents += 1;
            return acc;
          },
          { images: 0, documents: 0, audio: 0 }
        );
        setCounts(finalCounts);
      } catch (error) {
} finally {
        if (alive) setScanning(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  const totalFiles = counts.images + counts.documents + counts.audio;
  const totalSizeMb = useMemo(() => {
    const bytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    return (bytes / 1024 / 1024).toFixed(1);
  }, [files]);

  const percent = progress?.total ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <LinearGradient colors={["#050505", "#0B1418", "#07110E"]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{scanning ? "Discovering Files…" : "Ready to Index"}</Text>
        <Text style={styles.subtitle}>
          {scanning
            ? "Scanning your device locally. Nothing leaves your phone."
            : "We found your memories. Start processing to enable search."}
        </Text>
      </View>

      <View style={styles.progressRing}>
        {scanning ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <Text style={styles.progressPercent}>{totalFiles}</Text>
        )}
        <Text style={styles.progressLabel}>{scanning ? `${percent}%` : "files"}</Text>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Images</Text>
          <Text style={styles.statValue}>{counts.images}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Documents</Text>
          <Text style={styles.statValue}>{counts.documents}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Audio</Text>
          <Text style={styles.statValue}>{counts.audio}</Text>
        </View>
      </View>

      {!scanning && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <Text style={styles.summaryText}>Total files: {totalFiles}</Text>
          <Text style={styles.summaryText}>Estimated storage: {totalSizeMb} MB</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, scanning && styles.buttonDisabled]}
          onPress={() => props.onStartProcessing(files)}
          disabled={scanning}
        >
          <Text style={styles.primaryText}>{scanning ? "Scanning…" : "Start Processing"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={props.onSkip}>
          <Text style={styles.secondaryText}>Do This Later</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
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
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  subtitle: {
    ...typography.body2,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  progressRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 6,
    borderColor: "rgba(16, 185, 129, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginVertical: spacing.xl,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
  },
  progressPercent: {
    ...typography.display2,
    color: colors.text,
  },
  progressLabel: {
    ...typography.body3,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  statLabel: {
    ...typography.body2,
    color: colors.textSecondary,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  summaryCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    ...typography.label1,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  summaryText: {
    ...typography.body3,
    color: colors.text,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  primaryButton: {
    height: 52,
    borderRadius: borderRadii.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  primaryText: {
    ...typography.buttonLarge,
    color: colors.textInverse,
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    ...typography.body3,
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
