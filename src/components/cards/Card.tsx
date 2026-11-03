import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { color, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/** Card surface #1A1D1F, set apart by its tone, not an outline. `featured` tints it with the accent. */
export function Card({ children, featured, style, ...rest }: ViewProps & { children: ReactNode; featured?: boolean }) {
  return (
    <View style={[styles.card, featured && styles.featured, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      backgroundColor: color.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.sm,
    },
    // a faint accent tint (buttons inside still contrast with it)
    featured: { backgroundColor: color.accentSoft },
  }),
);
