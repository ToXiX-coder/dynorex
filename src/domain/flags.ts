/**
 * Feature flags control what the app SHOWS. They never grant access: every capability behind a
 * flag is also authorized on the server. Defaults are safe (off) for anything not yet built.
 */
export const FLAG_KEYS = [
  "line",
  "paddock",
  "marketplace",
  "buildOfTheWeek",
  "subscriptions",
  "discoverNearby",
  // Torq chat (AI mod advice from community data): off until its own review (decision D-48)
  "torqChat",
  // receipt scan (a receipt photo read by Claude to fill the mod form): off until the privacy policy names
  // Anthropic and the key is set (D-68)
  "receiptScan",
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];
export type Flags = Readonly<Record<FlagKey, boolean>>;

export const DEFAULT_FLAGS: Flags = Object.freeze({
  line: false,
  paddock: false,
  marketplace: false,
  buildOfTheWeek: false,
  subscriptions: false,
  discoverNearby: false,
  torqChat: false,
  receiptScan: false,
});

/**
 * Parse overrides such as "line=true,paddock=false" (EXPO_PUBLIC_FLAG_OVERRIDES, development only).
 * Unknown keys and bad values are ignored. Production builds ignore overrides entirely.
 */
export function resolveFlags(raw: string | undefined, appEnv: string): Flags {
  if (!raw || appEnv === "production") return DEFAULT_FLAGS;
  const out: Record<FlagKey, boolean> = { ...DEFAULT_FLAGS };
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if ((FLAG_KEYS as readonly string[]).includes(k ?? "") && (v === "true" || v === "false")) {
      out[k as FlagKey] = v === "true";
    }
  }
  return Object.freeze(out);
}
