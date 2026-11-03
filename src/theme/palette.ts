/**
 * Immutable brand palette. Do not add colours here without a brand decision.
 * Documented in docs/design-tokens.md; contrast is checked in tests/unit/domain.test.ts and tests/unit/themes.test.ts.
 * The palette is the BRAND (logo, intro, store art). The app's UI colours are the roles in `color`, which follow the
 * theme the person picked (src/theme/themes.ts, D-59); the default theme is exactly these brand colours.
 */
export const palette = Object.freeze({
  asphaltBlack: "#111315",
  electricLime: "#AAFF00",
  aggressiveRed: "#E00000",
  boneWhite: "#F2EFE8",
  cardSurface: "#1A1D1F",
  logoGrayDark: "#888888",
  logoGrayMid: "#999999",
  logoGrayLight: "#AAAAAA",
} as const);

export type PaletteColor = (typeof palette)[keyof typeof palette];

/** Roles map colours to jobs. Components use roles, never raw hex. */
export interface ColorRoles {
  background: string;
  surface: string;
  /** A step up from `surface`: pressed rows, inputs on cards, nested panels. */
  surfaceRaised: string;
  text: string;
  /** Secondary text, units, hints. */
  textMuted: string;
  accent: string;
  onAccent: string;
  /** The accent at low strength: selected chips, status pills, icon tiles. */
  accentSoft: string;
  /**
   * Red is for borders, icons and destructive fills. Red TEXT on the dark themes is under 4.5:1,
   * so error messages use body text beside a red marker and a "⚠" icon.
   */
  danger: string;
  onDanger: string;
  /** Input outlines and other boundaries that must stay visible (3:1 against the background). */
  border: string;
  handle: string;
  disabledText: string;
  /** Hairline edges and dividers. */
  hairline: string;
  /** Accent at low strength for glows and light streaks behind hero art. */
  accentGlow: string;
  skeletonBase: string;
  skeletonHighlight: string;
}

/** The default theme (Asphalt + Electric Lime): the brand palette itself. themes.test.ts keeps it in step with themes.ts. */
export const DEFAULT_COLORS: Readonly<ColorRoles> = Object.freeze({
  background: palette.asphaltBlack,
  surface: palette.cardSurface,
  surfaceRaised: "#23272A",
  text: palette.boneWhite,
  textMuted: palette.logoGrayLight,
  accent: palette.electricLime,
  onAccent: palette.asphaltBlack,
  accentSoft: "rgba(170, 255, 0, 0.12)",
  danger: palette.aggressiveRed,
  onDanger: palette.boneWhite,
  border: palette.logoGrayDark,
  handle: palette.logoGrayDark,
  disabledText: palette.logoGrayDark,
  hairline: "rgba(242, 239, 232, 0.08)",
  accentGlow: "rgba(170, 255, 0, 0.18)",
  skeletonBase: palette.cardSurface,
  skeletonHighlight: "rgba(242, 239, 232, 0.06)",
});

/**
 * The live colour roles. Mutable on purpose: `applyTheme` (themes.ts) swaps the values and the app tree remounts,
 * so every render, and every style sheet made with `themed()`, reads the new theme.
 */
export const color: ColorRoles = { ...DEFAULT_COLORS };

/** Bumped on every theme change; `themed()` style sheets rebuild when it moves. */
export const themeState = { version: 0, dark: true, key: "asphalt:lime" };

/** WCAG relative luminance and contrast ratio, for tests and docs. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
