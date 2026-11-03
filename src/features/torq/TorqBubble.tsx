import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LIMIT, Tach } from "@/components/vehicle/Tach";
import { revAt } from "@/domain/easterEggs";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { haptic } from "@/services/haptics";
import { color, elevation, space } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { themed } from "@/theme/themed";

/** Tab bar height (see app/(tabs)/_layout.tsx): the bubble floats just above it. */
const TAB_BAR = 64;
const SIZE = 58;

/**
 * Screens where a floating button would sit on top of a form's Save button or a full-screen task (Torq's own
 * chat included: its message box sits there). The bubble shows everywhere else in the tabs.
 */
const HIDE_ON = /\/(new|edit|post|club-new|record|driver|profile-edit|search|costs|torq)(\/|$)|\/mods\/new|\/settings/;
export const showTorqBubble = (path: string) => !HIDE_ON.test(path);

/**
 * Ask Torq, one tap away: a round tachometer floating above the Paddock tab in the bottom right. Tap it and the
 * needle slams into the redline and bounces off the limiter, then the Torq chat opens (straight away with
 * reduced motion).
 */
/** When the chat opens: after the blip and a couple of limiter bounces (see revAt). */
export const OPEN_AFTER_MS = 650;
const IDLE = 0.68; // resting just under the redline: ready to go

export function TorqBubble() {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const reduced = useReducedMotion();
  const [rev, setRev] = useState(0);
  const raf = useRef<number | null>(null);
  const opening = useRef(false);
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const redline = () => {
    if (opening.current) return; // one launch per tap
    haptic.tap();
    if (reduced) return router.push("/torq");
    opening.current = true;
    const t0 = Date.now();
    let bumped = false;
    const step = () => {
      const t = Date.now() - t0;
      setRev(revAt(t));
      if (!bumped && t > 300) {
        bumped = true;
        haptic.tap(); // feel the limiter
      }
      if (t >= OPEN_AFTER_MS) {
        opening.current = false;
        raf.current = null;
        setRev(0);
        router.push("/torq");
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  if (!showTorqBubble(path)) return null;
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + TAB_BAR + space.md }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask Torq"
        accessibilityHint="Opens the mod advice chat"
        onPress={redline}
        style={({ pressed }) => [styles.bubble, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <View {...a11yHidden}>
          <Tach size={SIZE - 4} value={IDLE + (LIMIT - IDLE) * rev} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { position: "absolute", right: space.md, width: SIZE, height: SIZE },
    bubble: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: color.background,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: color.accent,
      overflow: "hidden",
      ...elevation.raised,
      shadowColor: color.accent,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
    },
  }),
);
