import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { categoryLabel } from "@/components/build/BuildBits";
import { Card } from "@/components/cards/Card";
import { Appear, native } from "@/components/motion/Motion";
import { Text } from "@/components/Text";
import {
  COMPLIANCE_LABELS,
  EMISSIONS_CATEGORIES,
  evidence,
  evidenceSteps,
  LEVELS,
  recordDate,
  recordStrip,
  type Level,
} from "@/domain/record";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { RecordEntry } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { themed } from "@/theme/themed";
import { color, radius, space, spring, touch } from "@/theme/tokens";

/**
 * D-64: the Build Record's building blocks. The ladder shows how much an entry rests on, in four steps, always
 * with its name in words; flags are things a buyer should ask about. Nothing here says "verified".
 */

/** One step of the ladder. Lit steps fill from the left on a snappy spring, after `delay` ms. */
function Mark({ on, delay, animate }: { on: boolean; delay: number; animate: boolean }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate || reduced || !on) return v.setValue(1);
    v.setValue(0);
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, ...spring.snappy, useNativeDriver: native }),
    ]);
    a.start();
    return () => a.stop();
  }, [animate, reduced, on, delay, v]);
  return (
    <View style={[styles.mark, on && styles.markLitEdge]}>
      {on ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.markFill, { transform: [{ scaleX: v }] }]} />
      ) : null}
    </View>
  );
}

/**
 * Four marks, one per step, lit when the entry has that step (they aren't cumulative); named by the highest.
 * `animate` fills the lit marks one after another, starting after `delay` ms.
 */
export function Ladder({
  level,
  steps,
  compact,
  animate = false,
  delay = 0,
}: {
  level: Level;
  steps?: readonly boolean[];
  compact?: boolean;
  animate?: boolean;
  delay?: number;
}) {
  const name = LEVELS[level]!.name;
  const lit = (i: number) => (steps ? Boolean(steps[i]) : i <= level);
  return (
    <View style={styles.ladder} accessible accessibilityLabel={`Evidence: ${name}, highest of 4 steps`}>
      <View style={styles.marks}>
        {LEVELS.map((x) => (
          <Mark key={x.level} on={lit(x.level)} animate={animate} delay={delay + x.level * 70} />
        ))}
      </View>
      {compact ? null : <Text variant="label">{name}</Text>}
    </View>
  );
}

const STRIP_COLOR = () => [color.border, color.textMuted, color.text, color.accent] as const;

function StripMark({ level, delay, height }: { level: Level; delay: number; height: number }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return v.setValue(1);
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, ...spring.snappy, useNativeDriver: native }),
    ]);
    a.start();
    return () => a.stop();
  }, [reduced, delay, v]);
  return (
    <Animated.View
      style={[
        styles.stripMark,
        {
          // stronger evidence stands taller, like a rev bar
          height: height * (0.4 + level * 0.2),
          backgroundColor: STRIP_COLOR()[level],
          transform: [{ skewX: "-20deg" }, { scaleY: v }],
        },
      ]}
    />
  );
}

/**
 * The whole record at a glance: one mark per live entry, oldest first, as tall and as bright as the highest step
 * it reached (shop-confirmed is lime). It rises left to right when the record opens.
 */
export function RecordStrip({ entries, height = 30 }: { entries: readonly RecordEntry[]; height?: number }) {
  const levels = recordStrip(entries);
  if (!levels.length) return null;
  const counts = [0, 0, 0, 0];
  levels.forEach((l) => (counts[l] = (counts[l] ?? 0) + 1));
  const step = Math.min(45, 700 / levels.length);
  return (
    <View
      accessible
      accessibilityLabel={`${levels.length} entries: ${counts[3]} shop-confirmed, ${counts[2]} with a part identified, ${counts[1]} with paperwork, ${counts[0]} owner-entered only`}
      style={[styles.strip, { height }]}
    >
      {levels.map((l, i) => (
        <StripMark key={i} level={l} delay={200 + i * step} height={height} />
      ))}
    </View>
  );
}

const TYPE_LABEL: Record<RecordEntry["type"], string> = { mod: "Mod", maintenance: "Service", dyno: "Dyno run" };

/**
 * One entry. In a list, pass `index`: the card arrives with depth, staggered by its place, and its ladder fills in
 * just after it lands.
 */
export function RecordEntryCard({
  e,
  backwards,
  onPress,
  index,
}: {
  e: RecordEntry;
  backwards?: ReadonlySet<string>;
  onPress?: () => void;
  index?: number;
}) {
  const card = <EntryCardBody e={e} backwards={backwards} onPress={onPress} index={index} />;
  return index === undefined ? (
    card
  ) : (
    <Appear depth index={index}>
      {card}
    </Appear>
  );
}

function EntryCardBody({
  e,
  backwards,
  onPress,
  index,
}: {
  e: RecordEntry;
  backwards?: ReadonlySet<string>;
  onPress?: () => void;
  index?: number;
}) {
  const ev = evidence(e, backwards);
  const meta = [recordDate(e.date)];
  if (e.odometer != null) meta.push(`${e.odometer.toLocaleString()} mi`);
  meta.push(TYPE_LABEL[e.type]);
  if (e.category) meta.push(categoryLabel(e.category));
  const sub: string[] = [];
  if (e.type === "dyno") {
    sub.push(
      `${[e.whp != null && `${Number(e.whp)} whp`, e.wtq != null && `${Number(e.wtq)} wtq`].filter(Boolean).join(" / ")}, owner-reported`,
    );
    if (e.installed_by) sub.push(`at ${e.installed_by}`);
  } else if (e.installed_by) sub.push(`Fitted by ${e.installed_by}`);
  if (e.type === "mod" && e.category && EMISSIONS_CATEGORIES.includes(e.category) && e.compliance !== "not_emissions_related") {
    sub.push(e.carb_eo ? `CARB EO ${e.carb_eo}` : COMPLIANCE_LABELS[e.compliance ?? "unknown"]);
  }
  const body = (
    <Card style={[{ gap: space.xs }, e.removed_at ? { opacity: 0.6 } : null]}>
      <Text variant="caption" muted>
        {meta.join(" · ")}
      </Text>
      <Text variant="title" style={e.removed_at ? styles.struck : undefined}>
        {[e.brand, e.title].filter(Boolean).join(" ")}
      </Text>
      {sub.length ? (
        <Text variant="caption" muted>
          {sub.join(" · ")}
        </Text>
      ) : null}
      <Ladder
        level={ev.level}
        steps={evidenceSteps(e)}
        animate={index !== undefined}
        delay={260 + Math.min(index ?? 0, 8) * 60}
      />
      {/* the ladder already says "Owner-entered"; the rest is what it rests on */}
      {ev.labels.filter((l) => l !== "Owner-entered").length ? (
        <Text variant="caption">{ev.labels.filter((l) => l !== "Owner-entered").join(" · ")}</Text>
      ) : null}
      {ev.flags.map((f) => (
        <FlagLine key={f.id} text={f.text} />
      ))}
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${LEVELS[ev.level]!.name}${ev.flags.length ? `, ${ev.flags.length} to ask about` : ""}`}
      onPress={onPress}
      style={withPress({ minHeight: touch.min })}
    >
      {body}
    </Pressable>
  );
}

/** Red is for markers only (red text fails contrast on the dark themes), so the words stay in the body colour. */
export function FlagLine({ text }: { text: string }) {
  return (
    <View style={styles.flag}>
      <Text variant="caption" style={{ color: color.danger }} accessibilityElementsHidden importantForAccessibility="no">
        ⚑
      </Text>
      <Text variant="caption" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** How to read a record, for a buyer who has never seen one. */
export function RecordLegend() {
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="label">How to read it</Text>
      {LEVELS.map((x) => (
        <View key={x.level} style={styles.legendRow}>
          <Ladder level={x.level} steps={LEVELS.map((y) => y.level === 0 || y.level === x.level)} compact />
          <Text variant="caption" style={{ flex: 1 }}>
            {`${x.name}: ${x.meaning}`}
          </Text>
        </View>
      ))}
      <FlagLine text="Something to ask the seller about: an edit after a shop confirmed it, something logged long after the work, a removed entry, or a mileage lower than an earlier one." />
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    ladder: { flexDirection: "row", alignItems: "center", gap: space.sm },
    marks: { flexDirection: "row", gap: 3 },
    mark: {
      width: 14,
      height: 6,
      borderRadius: radius.sm / 2,
      backgroundColor: color.surfaceRaised,
      borderWidth: 1,
      borderColor: color.border,
      overflow: "hidden",
      transform: [{ skewX: "-20deg" }],
    },
    markLitEdge: { borderColor: color.accent },
    // fills from the left edge
    markFill: { backgroundColor: color.accent, transformOrigin: "left" },
    strip: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
    stripMark: { flex: 1, maxWidth: 16, minWidth: 3, borderRadius: 1, transformOrigin: "bottom" },
    struck: { textDecorationLine: "line-through" },
    flag: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
    legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  }),
);
