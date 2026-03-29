import { StyleSheet, Text, View } from "react-native";

import type { SourceResult } from "../services/apiClient";
import { colors } from "../theme/colors";

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

export function SearchResultCard(props: { source: SourceResult; query: string }) {
  const { source, query } = props;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.fileName}>{source.name}</Text>
        <Text style={styles.score}>score {source.score.toFixed(3)}</Text>
      </View>
      <Text style={styles.path}>{source.path}</Text>
      {renderHighlighted(source.preview, query)}
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fileName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    flexShrink: 1,
  },
  score: {
    color: colors.accent,
    fontSize: 12,
  },
  path: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  preview: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  hit: {
    backgroundColor: "rgba(69, 224, 161, 0.3)",
    color: "#D8FFEE",
    fontWeight: "700",
  },
});
