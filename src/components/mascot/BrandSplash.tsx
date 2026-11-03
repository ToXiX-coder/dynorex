import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Tach } from "@/components/vehicle/Tach";
import { a11yHidden } from "@/utils/a11y";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { INTRO_MS, introFrame, QUICK_INTRO_MS, quickIntroFrame, SLASHES_FROM_MS, SPEED_SLASHES } from "@/domain/intro";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { color, space } from "@/theme/tokens";
import { Text } from "../Text";
import { LogoLockup } from "./Torq";
import { themed } from "@/theme/themed";

export const TAGLINE = "Prove Your Build. Find Your Road.";

const STAGE = 240;
const SEEN_KEY = "dynorex:intro:v1";

/**
 * App-open screen, 5 seconds on the first launch (D-52), then a 1.2-second logo-and-fuel-gauge version on later
 * launches (D-61; remembered on the device). The full version: a tachometer revs into the
 * redline and bounces off the limiter, then fades into the DynoRex logo with a fuel-gauge loading bar that slowly
 * fills with gas from E to F and the tagline under it, while speed slashes streak past behind (domain/intro.ts has the timeline). `onIntroDone` fires at INTRO_MS;
 * the app shows once that has happened AND the session is ready. With reduced motion it plays a gentler version
 * over the same 5 seconds: the needle sweep and fades, but no zoom and the slashes stand still.
 */
export function BrandSplash({ onIntroDone }: { onIntroDone?: () => void }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [t, setT] = useState(0);
  // null until we know whether this device has seen the full intro
  const [quick, setQuick] = useState<boolean | null>(null);
  const done = useRef(onIntroDone);
  // a tap ends the intro early (D-67); set once the clock is running
  const skip = useRef<() => void>(() => {});
  useEffect(() => {
    done.current = onIntroDone;
  }, [onIntroDone]);

  useEffect(() => {
    let alive = true;
    const decide = (seen: boolean) => alive && setQuick((q) => (q === null ? seen : q));
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => decide(v === "1"))
      .catch(() => decide(false));
    // storage that never answers: play the full intro rather than wait
    const fallback = setTimeout(() => decide(false), 300);
    return () => {
      alive = false;
      clearTimeout(fallback);
    };
  }, []);

  // the intro clock: starts once the length is known (reduced motion only changes the style, never the timing)
  useEffect(() => {
    if (quick === null) return;
    const total = quick ? QUICK_INTRO_MS : INTRO_MS;
    if (!quick) void AsyncStorage.setItem(SEEN_KEY, "1").catch(() => {});
    const t0 = Date.now();
    let raf = 0;
    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      setT(total);
      done.current?.();
    };
    skip.current = () => {
      cancelAnimationFrame(raf);
      finish();
    };
    const step = () => {
      const now = Date.now() - t0;
      setT(now);
      if (now >= total) return finish();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // browsers pause animation frames in a hidden tab: the app must still open, so a timer backs the clock up
    const backup = setTimeout(finish, total + 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(backup);
    };
  }, [quick]);

  const frame = quick ? quickIntroFrame(t) : introFrame(t);
  // reduced motion: keep the sweep and the fades, drop the zooms
  const f = reduced ? { ...frame, tachScale: 1, logoScale: 1 } : frame;
  return (
    <Pressable
      style={styles.root}
      onPress={() => skip.current()}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Dynorex. ${TAGLINE} Loading`}
      accessibilityHint="Tap to skip the intro"
    >
      {/* speed slashes streak past behind the logo */}
      <View style={[StyleSheet.absoluteFill, { opacity: f.logoOpacity }]} pointerEvents="none">
        {SPEED_SLASHES.map((s, i) => (
          <SpeedSlash key={i} slash={s} screenW={width} still={reduced} />
        ))}
      </View>

      {/* the tachometer and the logo share the stage: one fades into the other */}
      <View style={styles.stage}>
        {f.tachOpacity > 0.01 ? (
          <View style={[styles.layer, { opacity: f.tachOpacity, transform: [{ scale: f.tachScale }] }]}>
            <Tach size={STAGE} value={f.needle} numbers />
            <Text style={styles.rpm}>RPM × 1000</Text>
          </View>
        ) : null}
        <View style={[styles.layer, { opacity: f.logoOpacity, transform: [{ scale: f.logoScale }] }]}>
          <LogoLockup width={240} />
        </View>
      </View>
      {/* the loading bar is a fuel gauge filling from E to F, then the tagline under it */}
      <View style={[styles.below, { opacity: f.logoOpacity }]}>
        <FuelGauge level={f.fuel} />
        <Text variant="heading" style={styles.tagline}>
          {TAGLINE}
        </Text>
      </View>
    </Pressable>
  );
}

/** Loading bar as a fuel gauge: pump icon, E, a tank that fills with lime "gas", F. */
function FuelGauge({ level }: { level: number }) {
  const full = level >= 0.999;
  return (
    <View style={styles.fuelRow} {...a11yHidden}>
      <Svg width={18} height={20} viewBox="0 0 18 20">
        {/* pump body, window and nozzle hose */}
        <Path d="M2 2h9v16H2z" fill="none" stroke={color.accent} strokeWidth={2} />
        <Path d="M4 5h5v4H4z" fill={color.accent} />
        <Path d="M11 7h2l2 2v6a1.5 1.5 0 0 0 3 0V6l-2-2" fill="none" stroke={color.accent} strokeWidth={1.6} />
      </Svg>
      <Text style={styles.fuelMark}>E</Text>
      <View style={styles.tank}>
        <View style={[styles.gas, { width: `${Math.round(level * 1000) / 10}%` }]} />
        {/* quarter marks on the tank */}
        {[0.25, 0.5, 0.75].map((q) => (
          <View key={q} style={[styles.quarter, { left: `${q * 100}%` }]} />
        ))}
      </View>
      <Text style={[styles.fuelMark, full && { color: color.accent }]}>F</Text>
    </View>
  );
}

/** One streak: races left to right across the screen on a loop (stands still with reduced motion). */
function SpeedSlash({
  slash,
  screenW,
  still,
}: {
  slash: (typeof SPEED_SLASHES)[number];
  screenW: number;
  still: boolean;
}) {
  const [x] = useState(() => new Animated.Value(still ? 0.5 : 0));
  useEffect(() => {
    if (still) {
      x.setValue(0.5);
      return;
    }
    const run = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: slash.ms, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    );
    const start = setTimeout(() => run.start(), SLASHES_FROM_MS + slash.delay);
    return () => {
      clearTimeout(start);
      run.stop();
    };
  }, [still, x, slash]);
  const w = screenW * slash.w;
  return (
    <Animated.View
      style={[
        styles.slash,
        {
          top: `${slash.top * 100}%`,
          width: w,
          height: slash.h,
          backgroundColor: color[slash.c],
          opacity: slash.c === "text" ? 0.5 : 0.85,
          transform: [
            { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w * 1.2, screenW * 1.1] }) },
            { skewX: "-30deg" },
          ],
        },
      ]}
    />
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: color.background,
      alignItems: "center",
      justifyContent: "center",
      gap: space.md,
      padding: space.xl,
    },
    stage: { width: STAGE, height: STAGE, alignItems: "center", justifyContent: "center" },
    layer: { position: "absolute", alignItems: "center", justifyContent: "center" },
    rpm: {
      position: "absolute",
      bottom: 46,
      fontSize: 11,
      letterSpacing: 2,
      color: color.textMuted,
      fontWeight: "700",
    },
    below: { alignItems: "center", gap: space.md },
    fuelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
    fuelMark: { fontSize: 13, fontWeight: "800", color: color.textMuted, width: 12, textAlign: "center" },
    tank: {
      width: 170,
      height: 10,
      borderRadius: 2,
      borderWidth: 1.5,
      borderColor: color.border,
      backgroundColor: color.surface,
      overflow: "hidden",
      transform: [{ skewX: "-20deg" }],
    },
    gas: { height: "100%", backgroundColor: color.accent },
    quarter: { position: "absolute", top: 0, bottom: 0, width: 1.5, backgroundColor: color.background, opacity: 0.6 },
    tagline: { textAlign: "center", color: color.text },
    slash: { position: "absolute", left: 0, borderRadius: 2 },
  }),
);
