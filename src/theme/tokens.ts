import { Platform } from "react-native";
import { FONT } from "./fonts";

export { palette, color } from "./palette";
export type { PaletteColor } from "./palette";
export { FONT } from "./fonts";

/** 8-point rhythm with named half steps. */
export const space = Object.freeze({
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
});

export const radius = Object.freeze({ sm: 4, md: 8, lg: 12, xl: 16, pill: 999 });

export const border = Object.freeze({ hairline: 1, regular: 2, accent: 3, focus: 3 });

export const elevation = Object.freeze({
  none: { shadowOpacity: 0, elevation: 0 },
  raised: {
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});

/** Motion. Every animation must also have a static path when reduced motion is on. */
export const motion = Object.freeze({
  fast: 150,
  normal: 250,
  slow: 400,
  shimmerLoop: 1200,
  splashMax: 900,
});

/**
 * Spring presets for Animated.spring. Springs are interruptible, so they suit anything the user can tap again
 * before it settles. Snappy for small controls, gentle for cards and screens, bouncy for earned moments only.
 */
export const spring = Object.freeze({
  snappy: { stiffness: 400, damping: 30, mass: 1 },
  gentle: { stiffness: 200, damping: 22, mass: 1 },
  bouncy: { stiffness: 320, damping: 12, mass: 1 },
});

/** Minimum touch target in logical points/dp. */
export const touch = Object.freeze({ min: 44, fab: 64 });

export const iconSize = Object.freeze({ sm: 16, md: 24, lg: 32, xl: 48 });

const monoFamily = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/**
 * No thin or light weights anywhere. Minimum weight is 400.
 * Display/heading use bundled Orbitron, buttons/spec Barlow Condensed (theme/fonts.ts). Each file IS the weight, so
 * those styles set no fontWeight (Android would otherwise fake-bold an already heavy face).
 */
const TABULAR: "tabular-nums"[] = ["tabular-nums"];

export const type = Object.freeze({
  // Orbitron (logo-style headers) is far wider than the old condensed face, so these sizes are smaller
  display: {
    fontFamily: FONT.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heading: {
    fontFamily: FONT.header,
    fontSize: 19,
    lineHeight: 26,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  /** Section titles inside a screen: plain and sentence case, so the Orbitron names and titles stay the brand moment. */
  section: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  // sentence case reads calmer than shouted caps; the condensed face still fits tight rows
  button: { fontFamily: FONT.heading, fontSize: 18, lineHeight: 22, letterSpacing: 0.3 },
  /**
   * Bone on Aggressive Red is 4.39:1, short of 4.5:1 for normal text. Destructive labels use this
   * WCAG "large text" size (18pt bold), where the requirement is 3:1.
   */
  buttonLarge: { fontFamily: FONT.heading, fontSize: 20, lineHeight: 24, letterSpacing: 0.3 },
  /** HP, torque, weight, 0-60. */
  spec: { fontFamily: FONT.spec, fontSize: 38, lineHeight: 40, fontVariant: TABULAR },
  specUnit: { fontFamily: FONT.heading, fontSize: 15, lineHeight: 18, letterSpacing: 0.5, textTransform: "uppercase" },
  /** Big aggressive numbers on heroes and the dyno readout. */
  impact: { fontFamily: FONT.impact, fontSize: 56, lineHeight: 56, fontVariant: TABULAR },
  /** Codes and identifiers (check-in code). */
  mono: { fontFamily: monoFamily, fontSize: 16, lineHeight: 20, fontWeight: "700" },
} as const);

export const layout = Object.freeze({ maxContentWidth: 640, screenGutter: space.lg });
