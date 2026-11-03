import { router, type Href } from "expo-router";
import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/buttons/Button";
import { HOME } from "@/components/navigation/stackOptions";
import { Text } from "@/components/Text";
import { nextStep, TOUR_STEPS } from "@/domain/tour";
import { config } from "@/services/config";
import { border, color, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

// which tour step is showing (null: no tour). A tiny store so the badge can start it and the card can follow it.
let step: number | null = null;
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
function go(i: number | null) {
  step = i;
  listeners.forEach((f) => f());
  if (i === null) return;
  const path = TOUR_STEPS[i]!.path;
  router.push((path === "/" ? HOME : path) as Href);
}

/** Pitch mode only: start the guided tour from the first stop. */
export const startTour = () => go(0);

/**
 * The tour's caption card, pinned above the tab bar while a tour runs: what this screen shows, then Next. Ending it
 * (or finishing) leaves you wherever you are, free to tap around.
 */
export function TourCard() {
  const insets = useSafeAreaInsets();
  const i = useSyncExternalStore(subscribe, () => step);
  if (!config.demoMode || i === null) return null;
  const s = TOUR_STEPS[i]!;
  const next = nextStep(i);
  return (
    <View
      style={[styles.card, { bottom: insets.bottom + 104 }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Tour, stop ${i + 1} of ${TOUR_STEPS.length}: ${s.title}. ${s.body}`}
    >
      <Text variant="caption" style={{ color: color.accent }}>
        {`TOUR · ${i + 1} OF ${TOUR_STEPS.length}`}
      </Text>
      <Text variant="bodyStrong">{s.title}</Text>
      <Text variant="caption">{s.body}</Text>
      <View style={styles.row}>
        <Button title="End tour" variant="secondary" onPress={() => go(null)} />
        {i > 0 ? <Button title="Back" variant="secondary" onPress={() => go(i - 1)} /> : null}
        <Button title={next === null ? "Done" : "Next"} onPress={() => go(next)} />
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      position: "absolute",
      left: space.md,
      right: space.md,
      backgroundColor: color.surface,
      borderWidth: border.regular,
      borderColor: color.accent,
      borderRadius: radius.lg,
      padding: space.md,
      gap: space.xs,
    },
    row: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end", flexWrap: "wrap" },
  }),
);
