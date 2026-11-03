import { color, palette, themeState, type ColorRoles } from "./palette";

/**
 * Themes people can pick (D-59): a base (the surfaces and text) and an accent. Every pair is checked for contrast in
 * tests/unit/themes.test.ts. Asphalt + Electric Lime is the default and is exactly the brand palette. The logo and
 * the app-open intro always use the brand palette, whatever the theme.
 */
export type BaseId = "asphalt" | "carbon" | "midnight" | "workshop" | "daylight";
export type AccentId = "lime" | "ice" | "ignition" | "caution" | "nitrous" | "neon";

export interface ThemeChoice {
  /** "auto" follows the phone: Daylight in light mode, Asphalt in dark mode. */
  base: BaseId | "auto";
  accent: AccentId;
}

export const DEFAULT_CHOICE: ThemeChoice = { base: "asphalt", accent: "lime" };

interface Base {
  id: BaseId;
  name: string;
  detail: string;
  dark: boolean;
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  disabledText: string;
  danger: string;
  onDanger: string;
}

export const BASES: readonly Base[] = [
  {
    id: "asphalt",
    name: "Asphalt",
    detail: "The Dynorex original",
    dark: true,
    background: palette.asphaltBlack,
    surface: palette.cardSurface,
    surfaceRaised: "#23272A",
    text: palette.boneWhite,
    textMuted: palette.logoGrayLight,
    border: palette.logoGrayDark,
    disabledText: palette.logoGrayDark,
    danger: palette.aggressiveRed,
    onDanger: palette.boneWhite,
  },
  {
    id: "carbon",
    name: "Carbon",
    detail: "True black, easy on OLED screens",
    dark: true,
    background: "#000000",
    surface: "#121314",
    surfaceRaised: "#1C1E20",
    text: palette.boneWhite,
    textMuted: "#A6A6A6",
    border: "#7F7F7F",
    disabledText: "#7F7F7F",
    danger: palette.aggressiveRed,
    onDanger: palette.boneWhite,
  },
  {
    id: "midnight",
    name: "Midnight",
    detail: "Deep blue night drive",
    dark: true,
    background: "#0C111A",
    surface: "#151C28",
    surfaceRaised: "#1E2735",
    text: "#EEF1F6",
    textMuted: "#A3ADBD",
    border: "#7C879A",
    disabledText: "#7C879A",
    danger: palette.aggressiveRed,
    onDanger: palette.boneWhite,
  },
  {
    id: "workshop",
    name: "Workshop",
    detail: "Warm shop-light browns",
    dark: true,
    background: "#15120F",
    surface: "#201C18",
    surfaceRaised: "#2A2520",
    text: palette.boneWhite,
    textMuted: "#B3AA9E",
    border: "#8E8579",
    disabledText: "#8E8579",
    danger: palette.aggressiveRed,
    onDanger: palette.boneWhite,
  },
  {
    id: "daylight",
    name: "Daylight",
    detail: "Light, for bright days",
    dark: false,
    background: palette.boneWhite,
    surface: "#FFFFFF",
    surfaceRaised: "#E8E4DA",
    text: palette.asphaltBlack,
    textMuted: "#55595E",
    border: "#85898E",
    disabledText: "#6B6F74",
    danger: "#C80000",
    onDanger: "#FFFFFF",
  },
];

interface Accent {
  id: AccentId;
  name: string;
  /** On dark bases: bright, with dark text on it. */
  onDark: string;
  /** On light bases: deep, with white text on it. */
  onLight: string;
}

export const ACCENTS: readonly Accent[] = [
  { id: "lime", name: "Electric Lime", onDark: palette.electricLime, onLight: "#3B6B00" },
  { id: "ice", name: "Ice Blue", onDark: "#3DDCFF", onLight: "#00677F" },
  { id: "ignition", name: "Ignition Orange", onDark: "#FF8A1F", onLight: "#A84300" },
  { id: "caution", name: "Caution Yellow", onDark: "#FFD400", onLight: "#715800" },
  { id: "nitrous", name: "Nitrous Purple", onDark: "#B79CFF", onLight: "#5B35C9" },
  { id: "neon", name: "Neon Pink", onDark: "#FF5FA8", onLight: "#B0145C" },
];

export const isBaseId = (v: unknown): v is BaseId => BASES.some((b) => b.id === v);
export const isAccentId = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v);

/** Reads a saved choice defensively: anything unknown falls back to the default. */
export function parseChoice(raw: string | null): ThemeChoice {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<ThemeChoice>) : {};
    return {
      base: v.base === "auto" || isBaseId(v.base) ? v.base : DEFAULT_CHOICE.base,
      accent: isAccentId(v.accent) ? v.accent : DEFAULT_CHOICE.accent,
    };
  } catch {
    return DEFAULT_CHOICE;
  }
}

/** The base actually shown, with "auto" resolved against the phone's light/dark setting. */
export function resolveBase(choice: ThemeChoice, scheme: string | null | undefined): BaseId {
  if (choice.base !== "auto") return choice.base;
  return scheme === "light" ? "daylight" : "asphalt";
}

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function rolesFor(baseId: BaseId, accentId: AccentId): ColorRoles {
  const b = BASES.find((x) => x.id === baseId) ?? BASES[0]!;
  const a = ACCENTS.find((x) => x.id === accentId) ?? ACCENTS[0]!;
  const accent = b.dark ? a.onDark : a.onLight;
  // translucent text colour for edges and shimmer, so no extra colours are introduced
  return {
    background: b.background,
    surface: b.surface,
    surfaceRaised: b.surfaceRaised,
    text: b.text,
    textMuted: b.textMuted,
    accent,
    onAccent: b.dark ? palette.asphaltBlack : "#FFFFFF",
    accentSoft: rgba(accent, b.dark ? 0.12 : 0.1),
    danger: b.danger,
    onDanger: b.onDanger,
    border: b.border,
    handle: b.border,
    disabledText: b.disabledText,
    hairline: rgba(b.text, b.dark ? 0.08 : 0.1),
    accentGlow: rgba(accent, 0.18),
    skeletonBase: b.surface,
    skeletonHighlight: rgba(b.text, b.dark ? 0.06 : 0.05),
  };
}

export const baseInfo = (id: BaseId) => BASES.find((b) => b.id === id) ?? BASES[0]!;

/** Applies the theme only if it is not the one already live (safe to call on every render). */
export function ensureTheme(baseId: BaseId, accentId: AccentId) {
  if (themeState.key !== `${baseId}:${accentId}`) applyTheme(baseId, accentId);
}

/** Swaps the live colour roles. Callers remount the tree afterwards so everything re-reads them. */
export function applyTheme(baseId: BaseId, accentId: AccentId) {
  Object.assign(color, rolesFor(baseId, accentId));
  themeState.key = `${baseId}:${accentId}`;
  themeState.dark = baseInfo(baseId).dark;
  themeState.version += 1;
}
