import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Text";
import { color, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/** Show an easter-egg line for a few seconds. `say` again restarts the timer. */
export function useEggBubble(ms = 3500) {
  const [msg, setMsg] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  const say = useCallback((text: string) => setMsg((m) => ({ text, n: (m?.n ?? 0) + 1 })), []);
  return { text: msg?.text ?? null, say };
}

/**
 * The lime speech bubble every easter egg uses. Positioned by the caller (usually absolute over the thing that
 * was tapped); announced politely to screen readers; never takes touches.
 */
export function EggBubble({
  text,
  style,
  tail = "bottom",
}: {
  text: string | null;
  style?: StyleProp<ViewStyle>;
  tail?: "bottom" | "top" | "none";
}) {
  if (!text) return null;
  return (
    <View style={[styles.bubble, style]} pointerEvents="none" accessibilityLiveRegion="polite">
      {tail === "none" ? null : <View style={[styles.tail, tail === "top" ? { top: -5 } : { bottom: -5 }]} />}
      <Text variant="caption" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bubble: {
      backgroundColor: color.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      zIndex: 20,
      elevation: 20,
      maxWidth: 260,
    },
    tail: {
      position: "absolute",
      left: 20,
      width: 10,
      height: 10,
      backgroundColor: color.accent,
      transform: [{ rotate: "45deg" }],
    },
    text: { color: color.onAccent, fontWeight: "700" },
  }),
);
