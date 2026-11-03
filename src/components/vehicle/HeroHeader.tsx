import { useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { EggBubble, useEggBubble } from "@/components/feedback/EggBubble";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { haptic } from "@/services/haptics";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Text } from "@/components/Text";
import { useCountUp } from "@/hooks/useCountUp";
import { isStock, specRange, type SpecField } from "@/domain/specRange";
import { a11yHidden } from "@/utils/a11y";
import { color, layout, space, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

// the title block overlaps the bottom of the frame by this much; drawn cars stand above it
const ART_INSET = 34;

/** A headline number, always a range (domain/specRange.ts). */
export type HeroStat = { low: number; high: number; decimals: number; unit: string; label: string };

type EstimateLike = {
  hp?: number | string | null;
  hp_status?: string;
  torque_lbft?: number | string | null;
  torque_status?: string;
  zero_to_sixty_s?: number | string | null;
  zero_to_sixty_status?: string;
  completed_mods_counted?: number | string | null;
} | null;

/**
 * Headline numbers for the hero: only real estimates (unknown or invalid ones are explained in the spec card).
 * A stock car shows the owner's exact numbers; ranges start with the first completed mod.
 */
export function heroStatsFrom(e: EstimateLike): HeroStat[] {
  if (!e) return [];
  const out: HeroStat[] = [];
  const stock = isStock(e);
  const add = (
    field: SpecField,
    v: number | string | null | undefined,
    status: string | undefined,
    unit: string,
    label: string,
  ) => {
    if (status !== "estimate" || v == null) return;
    if (stock) {
      const decimals = field === "zero_to_sixty" ? 1 : 0;
      const exact = Number(Number(v).toFixed(decimals));
      out.push({ low: exact, high: exact, decimals, unit, label: `${label} · stock` });
      return;
    }
    const r = specRange(field, Number(v));
    if (r) out.push({ ...r, unit, label });
  };
  add("hp", e.hp, e.hp_status, "hp", "Power");
  add("torque", e.torque_lbft, e.torque_status, "lb-ft", "Torque");
  add("zero_to_sixty", e.zero_to_sixty_s, e.zero_to_sixty_status, "s", "0–60");
  return out;
}

/** D-71: an e-bike's headline numbers are its stock motor, range and top speed, exact (they're the owner's). */
export function ebikeHeroStats(b: {
  motor_w?: number | string | null;
  range_mi?: number | string | null;
  top_speed_mph?: number | string | null;
}): HeroStat[] {
  const out: HeroStat[] = [];
  const add = (v: number | string | null | undefined, unit: string, label: string) => {
    if (v === null || v === undefined || !Number(v)) return;
    const x = Math.round(Number(v));
    out.push({ low: x, high: x, decimals: 0, unit, label });
  };
  add(b.motor_w, "W", "Motor");
  add(b.range_mi, "mi", "Range");
  add(b.top_speed_mph, "mph", "Top speed");
  return out;
}

/**
 * The top of a vehicle or build page: the car fills a tall frame, a dark fade rises from the bottom so the
 * name always reads on any photo, then the name, the car, a short status line and up to three headline numbers.
 * Numbers are estimates from the spec card below, which carries the disclaimer.
 */
export function HeroHeader({
  media,
  kicker,
  title,
  subtitle,
  stats = [],
  height = 300,
  honk,
  scrollY,
}: {
  /** Renders the photo or art into `style`; illustrations should lift the car by `artInset` above the title. */
  media: (style: object, artInset: number) => ReactNode;
  kicker?: string;
  title: string;
  subtitle?: string;
  stats?: HeroStat[];
  height?: number;
  /** Easter egg: tapping the picture honks and the car says this (domain/easterEggs honkLine). */
  honk?: (tap: number) => string;
  /** The page's scroll offset: the picture drifts slower than the page, zooms a touch and dims as it leaves. */
  scrollY?: Animated.Value;
}) {
  const bubble = useEggBubble();
  const reduced = useReducedMotion();
  const parallax = scrollY && !reduced ? scrollY : null;
  const [taps, setTaps] = useState(0);
  const [flash] = useState(() => new Animated.Value(0));
  const onHonk = () => {
    if (!honk) return;
    haptic.tap();
    bubble.say(honk(taps));
    setTaps((t) => t + 1);
    if (reduced) return;
    // headlights: two quick flashes
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };
  return (
    <View>
      <View style={{ height, overflow: "hidden" }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            parallax
              ? {
                  transform: [
                    // half speed on the way up; pulling down (iOS) zooms in instead of showing a gap
                    {
                      translateY: parallax.interpolate({
                        inputRange: [0, height],
                        outputRange: [0, height * 0.45],
                        extrapolate: "clamp",
                      }),
                    },
                    {
                      scale: parallax.interpolate({
                        inputRange: [-height, 0, height],
                        outputRange: [1.9, 1, 1.12],
                        extrapolate: "clamp",
                      }),
                    },
                  ],
                }
              : null,
          ]}
        >
          {media({ width: "100%", height }, ART_INSET)}
        </Animated.View>
        {parallax ? (
          <Animated.View
            pointerEvents="none"
            {...a11yHidden}
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: color.background,
                opacity: parallax.interpolate({ inputRange: [0, height], outputRange: [0, 0.6], extrapolate: "clamp" }),
              },
            ]}
          />
        ) : null}
        {honk ? (
          <>
            <Animated.View
              pointerEvents="none"
              {...a11yHidden}
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: color.text, opacity: Animated.multiply(flash, 0.14) },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Honk the horn"
              onPress={onHonk}
              style={StyleSheet.absoluteFill}
            />
            <EggBubble text={bubble.text} tail="none" style={styles.honk} />
          </>
        ) : null}
        <View style={[StyleSheet.absoluteFill, { top: height * 0.6 }]} pointerEvents="none" {...a11yHidden}>
          <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
            <Defs>
              <LinearGradient id="hero-scrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color.background} stopOpacity="0" />
                <Stop offset="0.55" stopColor={color.background} stopOpacity="0.85" />
                <Stop offset="1" stopColor={color.background} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="10" height="10" fill="url(#hero-scrim)" />
          </Svg>
        </View>
      </View>
      {/* the text block flows normally and overlaps the faded bottom of the image */}
      <View style={styles.overlay} pointerEvents="box-none">
        <Text variant="display" numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text muted>{subtitle}</Text> : null}
        {/* status line under the name, not a shouted label above it */}
        {kicker ? (
          <Text variant="caption" muted>
            {kicker}
          </Text>
        ) : null}
        {stats.length ? (
          <View style={styles.stats}>
            {stats.slice(0, 3).map((s) => (
              <HeroStatView key={s.label} stat={s} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    overlay: { marginTop: -40, paddingHorizontal: layout.screenGutter, gap: space.xxs },
    stats: { flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.xs, marginTop: space.sm },
    stat: { gap: 0 },
    honk: { position: "absolute", top: space.md, left: layout.screenGutter },
  }),
);

function HeroStatView({ stat }: { stat: HeroStat }) {
  const low = useCountUp(stat.low, 1000);
  const high = useCountUp(stat.high, 1000);
  return (
    <View
      style={styles.stat}
      accessible
      accessibilityLabel={
        stat.low === stat.high
          ? `${stat.label}: ${stat.low.toFixed(stat.decimals)} ${stat.unit}`
          : `${stat.label}: about ${stat.low.toFixed(stat.decimals)} to ${stat.high.toFixed(stat.decimals)} ${stat.unit}`
      }
    >
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={[type.impact, { fontSize: 30, lineHeight: 34 }]}>
          {stat.low === stat.high
            ? low.toFixed(stat.decimals)
            : `${low.toFixed(stat.decimals)}–${high.toFixed(stat.decimals)}`}
        </Text>
        <Text style={[type.specUnit, { color: color.textMuted }]}>{` ${stat.unit}`}</Text>
      </View>
      <Text variant="caption" muted>
        {stat.label}
      </Text>
    </View>
  );
}
