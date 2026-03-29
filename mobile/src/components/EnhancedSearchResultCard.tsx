import { Image, StyleSheet, Text, View } from "react-native";
import type { SourceResult } from "../services/apiClient";
import { colors } from "../theme/colors";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return ((bytes / Math.pow(k, i)) * 1).toFixed(1) + " " + sizes[i];
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toUpperCase() || "FILE";
}

function isImageFile(fileType?: string, fileName?: string): boolean {
  if (fileType?.startsWith("image/")) return true;
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext || "");
  }
  return false;
}

function renderHighlighted(preview: string, query: string) {
  if (!query.trim()) {
    return <Text style={styles.preview}>{preview}</Text>;
  }

  const lower = preview.toLowerCase();
  const token = query.trim().toLowerCase();
  const idx = lower.indexOf(token);

  if (idx < 0) {
    return <Text style={styles.preview}>{preview}</Text>;
  }

  const before = preview.slice(0, idx);
  const hit = preview.slice(idx, idx + token.length);
  const after = preview.slice(idx + token.length);

  return (
    <Text style={styles.preview}>
      {before}
      <Text style={styles.hit}>{hit}</Text>
      {after}
    </Text>
  );
}

export interface EnhancedSourceResult extends SourceResult {
  file_type?: string;
  file_size?: number;
  created_at?: number;
  image_uri?: string;
}

export function EnhancedSearchResultCard(props: { source: EnhancedSourceResult; query: string }) {
  const { source, query } = props;
  const isImage = isImageFile(source.file_type, source.name);
  const fileExt = getFileExtension(source.name);

  return (
    <View style={styles.card}>
      {/* Header with File Type & Score */}
      <View style={styles.headerRow}>
        <View style={styles.fileTypeBox}>
          <Text style={styles.fileType}>{fileExt}</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.fileName}>{source.name}</Text>
          <Text style={styles.score}>Relevance: {(source.score * 100).toFixed(0)}%</Text>
        </View>
      </View>

      {/* Image Preview (if image) */}
      {isImage && source.image_uri && (
        <Image
          source={{ uri: source.image_uri }}
          style={styles.imagePreview}
        />
      )}

      {/* File Path */}
      <View style={styles.metadataRow}>
        <Text style={styles.metadataLabel}>📍 Location:</Text>
        <Text style={styles.metadataValue} numberOfLines={2}>
          {source.path}
        </Text>
      </View>

      {/* File Info */}
      <View style={styles.infoRow}>
        {source.file_type && (
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>{source.file_type.split("/").pop()?.toUpperCase() || "Unknown"}</Text>
          </View>
        )}
        {source.file_size && (
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>{formatFileSize(source.file_size)}</Text>
          </View>
        )}
        {source.created_at && (
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>{formatDate(source.created_at)}</Text>
          </View>
        )}
      </View>

      {/* Text Preview */}
      {source.preview && (
        <View style={styles.previewSection}>
          <Text style={styles.previewLabel}>📄 Extract:</Text>
          {renderHighlighted(source.preview, query)}
        </View>
      )}

      {/* Chunk Info */}
      {source.chunk_index !== undefined && (
        <Text style={styles.chunkInfo}>
          Chunk #{source.chunk_index + 1}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  fileTypeBox: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 50,
    alignItems: "center",
  },
  fileType: {
    color: "#072117",
    fontWeight: "700",
    fontSize: 11,
  },
  headerMeta: {
    flex: 1,
  },
  fileName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 3,
  },
  score: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
  },
  imagePreview: {
    width: "100%",
    height: 140,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: "#1A2440",
  },
  metadataRow: {
    marginBottom: 10,
  },
  metadataLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
  },
  metadataValue: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
    backgroundColor: "rgba(69, 224, 161, 0.05)",
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingLeft: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  infoPill: {
    backgroundColor: "rgba(69, 224, 161, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  infoPillText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "600",
  },
  previewSection: {
    backgroundColor: "rgba(69, 224, 161, 0.05)",
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  previewLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  preview: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  hit: {
    backgroundColor: "rgba(69, 224, 161, 0.3)",
    color: "#D8FFEE",
    fontWeight: "700",
  },
  chunkInfo: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },
});
