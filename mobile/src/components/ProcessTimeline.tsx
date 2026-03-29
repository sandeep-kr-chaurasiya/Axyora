import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export interface ProcessStep {
  label: string;
  status: "pending" | "active" | "done";
}

export function ProcessTimeline(props: { steps: ProcessStep[] }) {
  return (
    <View style={styles.wrap}>
      {props.steps.map((step, idx) => (
        <View key={idx} style={styles.stepRow}>
          <View style={[styles.stepCircle, styles[`status_${step.status}`]]}>
            {step.status === "done" && <Text style={styles.checkmark}>✓</Text>}
            {step.status === "active" && <Text style={styles.spinner}>●</Text>}
            {step.status === "pending" && <Text style={styles.pending}>○</Text>}
          </View>
          <Text style={[styles.stepLabel, step.status === "active" && styles.activeLabel]}>
            {step.label}
          </Text>
          {idx < props.steps.length - 1 && <View style={styles.connector} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    position: "relative",
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  status_pending: {
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  status_active: {
    borderColor: colors.accent,
    backgroundColor: "rgba(69, 224, 161, 0.1)",
  },
  status_done: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkmark: {
    color: "#072117",
    fontWeight: "800",
    fontSize: 16,
  },
  spinner: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  pending: {
    color: colors.textMuted,
    fontSize: 18,
  },
  stepLabel: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
  },
  activeLabel: {
    color: colors.text,
    fontWeight: "700",
  },
  connector: {
    position: "absolute",
    left: 16,
    top: 32,
    width: 2,
    height: 8,
    backgroundColor: colors.border,
  },
});
