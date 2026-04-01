import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing, borderRadii } from "../theme/spacing";
import { typography } from "../theme/fonts";

export function SuggestedQueries(props: {
  title?: string;
  suggestions: string[];
  onSelect: (query: string) => void;
}) {
  const { title = "Try asking…", suggestions, onSelect } = props;

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        {suggestions.map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            style={styles.pill}
            onPress={() => onSelect(suggestion)}
          >
            <Text style={styles.pillText}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  title: {
    ...typography.label2,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillText: {
    ...typography.body3,
    color: colors.text,
  },
});
