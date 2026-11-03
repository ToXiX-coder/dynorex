import { StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { color, radius, space } from "@/theme/tokens";
import { Torq } from "./Torq";
import type { TorqExpression } from "./art";
import { themed } from "@/theme/themed";

/** Torq pops in with a one-liner (easter eggs). Read as "Torq says: …"; never blocks the form around it. */
export function TorqNote({ text, expression = "shrugging" }: { text: string; expression?: TorqExpression }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`Torq says: ${text}`} accessibilityLiveRegion="polite">
      <Torq expression={expression} size={44} decorative />
      <View style={styles.bubble}>
        <Text variant="caption">{text}</Text>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    bubble: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: color.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      backgroundColor: color.surface,
    },
  }),
);
