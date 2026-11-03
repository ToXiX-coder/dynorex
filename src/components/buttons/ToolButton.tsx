import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";
import { a11yHidden } from "@/utils/a11y";
import { Text } from "../Text";

/**
 * A secondary action in a toolbar row: an icon over a short label, sharing the row equally with its neighbours.
 * Keeps one primary button per screen while the rest stay one tap away.
 */
export function ToolButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
    >
      <View {...a11yHidden}>{icon}</View>
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The row the tool buttons share. */
export function ToolRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: space.sm },
    tool: {
      flex: 1,
      minHeight: touch.min + space.xl,
      alignItems: "center",
      justifyContent: "center",
      gap: space.xs,
      paddingHorizontal: space.xs,
      borderRadius: radius.md,
      backgroundColor: color.surface,
    },
    pressed: { backgroundColor: color.surfaceRaised, transform: [{ scale: 0.98 }] },
  }),
);
