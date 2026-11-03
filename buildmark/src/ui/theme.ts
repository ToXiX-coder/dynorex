import { Platform } from "react-native";

/**
 * Buildmark looks like the paperwork it replaces: a service book on warm paper, ink-blue entries and a stamp
 * green for what a shop confirmed. One light look on purpose. Text colors hold 4.5:1 or better on paper and card.
 */
export const color = {
  paper: "#F4F1EA",
  card: "#FBFAF6",
  ink: "#1C2430",
  muted: "#4F5866",
  rule: "#D8D2C4",
  accent: "#23439C",
  accentInk: "#FBFAF6",
  stamp: "#1E6B45",
  stampTint: "#E3EFE6",
  flag: "#8A5000",
  flagTint: "#FBEFD8",
  danger: "#A1261B",
  ladderOff: "#CFC8B8",
} as const;

export const font = {
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" }),
  sans: Platform.select({ ios: "System", android: "sans-serif", default: "system-ui, -apple-system, 'Segoe UI', sans-serif" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, Consolas, monospace" }),
};

export const size = { title: 28, heading: 20, body: 16, small: 14, label: 12 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = 10;
