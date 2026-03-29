import { StyleSheet, Text, View, Image } from "react-native";

import { colors } from "../theme/colors";

export interface ImageResult {
  file_name: string;
  file_path: string;
  caption: string;
  preview: string;
  image_uri?: string;
  thumbnail_path?: string;
  score: number;
  type: "image";
}

export function ImageResultCard(props: { image: ImageResult; query: string }) {
  const { image, query } = props;

  return (
    <View style={styles.card}>
      {/* Image thumbnail if available */}
      {image.image_uri && (
        <Image
          source={{ uri: `file://${image.image_uri}` }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      )}

      <View style={styles.contentContainer}>
        {/* Header: filename + score */}
        <View style={styles.headerRow}>
          <Text style={styles.fileName} numberOfLines={1}>
            {image.file_name}
          </Text>
          <Text style={styles.score}>score {image.score.toFixed(3)}</Text>
        </View>

        {/* File path */}
        <Text style={styles.path} numberOfLines={1}>
          {image.file_path}
        </Text>

        {/* Caption with highlight if query is present */}
        {image.caption && (
          <View style={styles.captionBox}>
            <Text style={styles.captionLabel}>Caption:</Text>
            <Text style={styles.caption} numberOfLines={3}>
              {image.caption}
            </Text>
          </View>
        )}

        {/* Tags display (if included in preview) */}
        {image.preview && image.preview !== image.caption && (
          <Text style={styles.tags} numberOfLines={2}>
            {image.preview}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 10,
  },
  thumbnail: {
    width: "100%",
    height: 180,
    backgroundColor: "#1F2937",
  },
  contentContainer: {
    padding: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  fileName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    flex: 1,
  },
  score: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
  },
  path: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 8,
  },
  captionBox: {
    backgroundColor: "rgba(69, 224, 161, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderRadius: 6,
  },
  captionLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  caption: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  tags: {
    color: colors.textMuted,
    fontSize: 11,
    fontStyle: "italic",
  },
});
