import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { haptic } from "@/services/haptics";
import { motion, spring, space } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { Text } from "../Text";

/**
 * Shared motion (React Native Animated, native driver where the platform has one). Everything here has a
 * static path: with reduced motion on, things simply appear and presses don't bounce.
 */
/** useNativeDriver value: the web has no native driver (it would warn and fall back). */
export const native = Platform.OS !== "web";
/** Never start fully transparent: content stays readable (and counts as visible) even mid-fade. */
const START_OPACITY = 0.01;
const easeOut = Easing.out(Easing.cubic);

/**
 * Fades content in with a short rise. `index` staggers items in a list (capped so long lists don't drag).
 * `depth` also grows it from 96% on a gentle spring, so cards in a list arrive like objects, not text.
 */
export function Appear({
  children,
  index = 0,
  delay = 0,
  rise = 10,
  depth = false,
  style,
}: {
  children: ReactNode;
  index?: number;
  delay?: number;
  rise?: number;
  depth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    const wait = delay + Math.min(index, 8) * (depth ? 60 : 45);
    const a = depth
      ? Animated.sequence([
          Animated.delay(wait),
          Animated.spring(v, { toValue: 1, ...spring.gentle, useNativeDriver: native }),
        ])
      : Animated.timing(v, { toValue: 1, duration: motion.normal, delay: wait, easing: easeOut, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [v, reduced, index, delay, depth]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [START_OPACITY, 1], extrapolate: "clamp" }),
          transform: reduced
            ? []
            : [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [depth ? rise * 2 : rise, 0] }) },
                ...(depth ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] : []),
              ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A rubber stamp landing on paper: drops in big and twisted, overshoots a touch and settles at a slight angle.
 * Only for things that really happened (a shop confirmed it, the VIN matched, a record arrived); `haptics` adds a
 * success buzz as it lands. With reduced motion it's simply there.
 */
export function Stamp({
  children,
  on = true,
  haptics = false,
  delay = 0,
  tilt = -2,
  style,
}: {
  children: ReactNode;
  on?: boolean;
  haptics?: boolean;
  delay?: number;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on) return v.setValue(0);
    if (reduced) {
      v.setValue(1);
      if (haptics) haptic.success();
      return;
    }
    v.setValue(0);
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, ...spring.bouncy, useNativeDriver: native }),
    ]);
    a.start();
    // the buzz lands with the stamp, not when it starts falling
    const t = haptics ? setTimeout(() => haptic.success(), delay + 140) : null;
    return () => {
      a.stop();
      if (t) clearTimeout(t);
    };
  }, [on, reduced, haptics, delay, v]);
  if (!on) return null;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [START_OPACITY, 1, 1], extrapolate: "clamp" }),
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.7, 1] }) },
            { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`${tilt - 10}deg`, `${tilt}deg`] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const FLAP_GLYPHS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const flapNoise = (text: string) =>
  [...text].map((ch) => (ch === "-" ? ch : FLAP_GLYPHS[Math.floor(Math.random() * FLAP_GLYPHS.length)]!)).join("");

/**
 * A departures-board reveal for one-time codes: every character spins through letters and clacks into place left
 * to right, with a tick as each one lands and a success buzz at the end. Screen readers get the code once, spelled
 * out in `label`; reduced motion shows it straight away.
 */
export function SplitFlap({
  text,
  label,
  textStyle,
  cellStyle,
}: {
  text: string;
  label: string;
  textStyle?: StyleProp<TextStyle>;
  cellStyle?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(() => flapNoise(text));
  useEffect(() => {
    if (reduced) return;
    const chars = [...text];
    const landAt = chars.map((_, i) => 5 + i * 2);
    const last = Math.max(...landAt);
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setShown(
        chars
          .map((ch, i) =>
            ch === "-" || tick >= landAt[i]! ? ch : FLAP_GLYPHS[Math.floor(Math.random() * FLAP_GLYPHS.length)]!,
          )
          .join(""),
      );
      if (tick >= last) {
        clearInterval(id);
        haptic.success();
      } else if (landAt.some((t, i) => t === tick && chars[i] !== "-")) haptic.select();
    }, 55);
    return () => clearInterval(id);
  }, [text, reduced]);
  const display = reduced ? text : shown;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
    >
      {[...display].map((ch, i) => (
        <View key={i} style={[cellStyle, text[i] === "-" && { backgroundColor: "transparent" }]} {...a11yHidden}>
          <Text style={textStyle}>{ch}</Text>
        </View>
      ))}
    </View>
  );
}

/** A springy press: shrinks a little on press-in and springs back. Spread the handlers onto a Pressable. */
export function usePressSpring(to = 0.96) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const go = (value: number) =>
    reduced
      ? scale.setValue(1)
      : Animated.spring(scale, {
          toValue: value,
          speed: 40,
          bounciness: value === 1 ? 8 : 0,
          useNativeDriver: native,
        }).start();
  return {
    scale,
    style: { transform: [{ scale }] },
    onPressIn: () => go(to),
    onPressOut: () => go(1),
  };
}

/**
 * A short sideways shake when content appears and whenever `trigger` changes (an error that needs attention).
 * Small (4 px) and over in a third of a second; reduced motion shows it still.
 */
export function Shake({ trigger, children }: { trigger: unknown; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const seq = Animated.sequence(
      [4, -4, 3, -2, 0].map((toValue) => Animated.timing(x, { toValue, duration: 60, useNativeDriver: native })),
    );
    seq.start();
    return () => seq.stop();
  }, [trigger, reduced, x]);
  return <Animated.View style={{ transform: [{ translateX: x }] }}>{children}</Animated.View>;
}

/** A slow idle float (mascots on empty and loading screens). Still with reduced motion. */
export function Idle({ children, lift = 4, ms = 2400 }: { children: ReactNode; lift?: number; ms?: number }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms / 2, easing: ease, useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: ms / 2, easing: ease, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, v, ms]);
  return (
    <Animated.View
      style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -lift] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

/** A quick celebratory bounce whenever `trigger` changes (saved, sent, accepted). Not on first render. */
export function Pop({
  trigger,
  children,
  style,
}: {
  trigger: unknown;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    scale.setValue(0.85);
    const a = Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 14, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [trigger, reduced, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
