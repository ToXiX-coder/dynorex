import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { space } from "@/theme/tokens";
import { Text } from "./Text";

/**
 * A section title inside a screen: plain, sentence case, with an optional action on the right. Screen titles and
 * big names keep the Orbitron brand face; sections stay quiet so those stand out (D-69).
 */
export function SectionHeader({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="section" accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flex: 1 },
});
