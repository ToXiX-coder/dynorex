import { a11yHidden } from "@/utils/a11y";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import { ERROR_COPY, type ErrorKey } from "@/domain/copy/errors";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { border, color, motion, radius, space } from "@/theme/tokens";
import { Button } from "../buttons/Button";
import { Idle } from "../motion/Motion";
import { Torq } from "../mascot/Torq";
import type { TorqExpression } from "../mascot/art";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/** Empty state: shrugging Torq (or another pose), short Bone message, optional action. */
export function EmptyState({
  message,
  detail,
  action,
  expression = "shrugging",
}: {
  message: string;
  detail?: string;
  action?: { title: string; onPress: () => void };
  expression?: TorqExpression;
}) {
  return (
    <View style={styles.center}>
      <Idle>
        <Torq expression={expression} size={110} />
      </Idle>
      <Text variant="title" style={styles.centerText} accessibilityRole="header">
        {message}
      </Text>
      {detail ? (
        <Text muted style={styles.centerText}>
          {detail}
        </Text>
      ) : null}
      {action ? <Button title={action.title} onPress={action.onPress} /> : null}
    </View>
  );
}

/** Error state from the spec copy table. Torq arms crossed + red accent bar. Retry only if safe. */
export function ErrorState({ kind, onAction }: { kind: ErrorKey; onAction?: (action: string) => void }) {
  const c = ERROR_COPY[kind];
  const pose: TorqExpression = "torq" in c ? (c.torq ?? "armsCrossed") : "armsCrossed";
  // iOS ignores live regions, so announce explicitly; Android also gets the live region.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${c.title}. ${c.body}`);
  }, [c.title, c.body]);
  return (
    <View style={styles.center} accessibilityLiveRegion="assertive">
      <View style={styles.redBar} {...a11yHidden} />
      <Torq expression={pose} size={110} />
      <Text variant="title" style={styles.centerText}>
        {c.title}
      </Text>
      <Text muted style={styles.centerText}>
        {c.body}
      </Text>
      <View style={styles.row}>
        {c.actions.map((a, i) => (
          <Button
            key={a}
            title={a}
            variant={"destructive" in c && i === 0 ? "destructive" : i === 0 ? "primary" : "secondary"}
            onPress={() => onAction?.(a)}
          />
        ))}
      </View>
    </View>
  );
}

/** Shimmer skeleton. With reduced motion it is a static block. */
export function Skeleton({ height = 16, width = "100%" as const }: { height?: number; width?: number | `${number}%` }) {
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: motion.shimmerLoop / 2, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: motion.shimmerLoop / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <View style={[styles.skel, { height, width }]} {...a11yHidden}>
      {!reduced && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: color.skeletonHighlight, opacity: pulse }]}
        />
      )}
    </View>
  );
}

/** Loading block: wrenching Torq + skeleton rows, announced once to screen readers. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <View style={styles.center} accessible accessibilityLabel={label} accessibilityRole="progressbar">
      <Idle lift={3} ms={1600}>
        <Torq expression="wrenching" size={90} />
      </Idle>
      <View style={{ alignSelf: "stretch", gap: space.sm }}>
        <Skeleton height={20} width="70%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="85%" />
      </View>
    </View>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  // the bar glides to each new value instead of jumping (width can't use the native driver)
  const [w] = useState(() => new Animated.Value(pct));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return w.setValue(pct);
    Animated.timing(w, { toValue: pct, duration: motion.normal, useNativeDriver: false }).start();
  }, [pct, reduced, w]);
  return (
    <View style={{ gap: space.xs }}>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      >
        <Animated.View
          style={[styles.fill, { width: w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
        />
      </View>
      <Text variant="caption" muted>{`${label}: ${Math.round(pct * 100)}%`}</Text>
    </View>
  );
}

/** "Coming Soon" badge: gray outline + text, so it never looks like an active control. */
export function ComingSoonBadge() {
  return (
    <View style={styles.badge}>
      <Text variant="caption" muted>
        COMING SOON
      </Text>
    </View>
  );
}

/** Honest notice for screens whose real content arrives in a later phase. */
export function PhaseNotice({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Text variant="label">{`Not built yet (Phase ${phase})`}</Text>
      <Text variant="caption" muted>
        {children}
      </Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    center: { alignItems: "center", gap: space.md, padding: space.xl },
    centerText: { textAlign: "center" },
    row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", justifyContent: "center" },
    redBar: { width: 48, height: 4, backgroundColor: color.danger, borderRadius: 2 },
    skel: { backgroundColor: color.skeletonBase, borderRadius: radius.sm, overflow: "hidden" },
    track: { height: 8, borderRadius: 4, backgroundColor: color.surface, overflow: "hidden" },
    fill: { height: 8, backgroundColor: color.accent },
    badge: {
      borderWidth: border.hairline,
      borderColor: color.border,
      borderRadius: radius.sm,
      paddingHorizontal: space.xs,
      alignSelf: "flex-start",
    },
    notice: {
      borderWidth: border.hairline,
      borderStyle: "dashed",
      borderColor: color.border,
      borderRadius: radius.md,
      padding: space.md,
      gap: space.xxs,
    },
  }),
);
