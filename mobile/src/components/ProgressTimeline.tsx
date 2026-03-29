import { StyleSheet, Text, View } from "react-native";

import type { QueueProgressEvent } from "../services/indexingQueue";
import { colors } from "../theme/colors";

export function ProgressTimeline(props: { events: QueueProgressEvent[] }) {
  const items = props.events.slice(0, 8);
  return (
    <View style={styles.wrap}>
      {items.map((event, idx) => (
        <View key={`${event.file.id}-${idx}`} style={styles.row}>
          <View style={[styles.dot, event.status === "error" ? styles.dotError : styles.dotOk]} />
          <View style={styles.textWrap}>
            <Text style={styles.file}>{event.file.name}</Text>
            <Text style={styles.step}>{event.step}</Text>
            <Text style={styles.meta}>
              {event.status.toUpperCase()} • {event.progress}%
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  dot: {
    marginTop: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOk: {
    backgroundColor: colors.accent,
  },
  dotError: {
    backgroundColor: colors.danger,
  },
  textWrap: {
    flex: 1,
  },
  file: {
    color: colors.text,
    fontWeight: "700",
  },
  step: {
    color: colors.text,
    marginTop: 2,
  },
  meta: {
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 12,
  },
});
