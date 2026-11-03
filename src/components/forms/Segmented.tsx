import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * One choice from a few, as a single bar of equal segments (radio semantics). Reads as one control rather than a
 * row of loose chips; the chosen segment is filled, never colour alone (it is also bold and announced as checked).
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  /** what the bar picks, for screen readers */
  label: string;
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.bar} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={String(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.id)}
            style={({ pressed }) => [styles.seg, on && styles.on, pressed && !on && styles.pressed]}
          >
            <Text variant={on ? "bodyStrong" : "body"} style={{ color: on ? color.background : color.text }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: { flexDirection: "row", backgroundColor: color.surface, borderRadius: radius.md, padding: 3, gap: 3 },
    seg: {
      flex: 1,
      minHeight: touch.min,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.sm,
      paddingHorizontal: space.xs,
    },
    on: { backgroundColor: color.text },
    pressed: { opacity: 0.7 },
  }),
);
