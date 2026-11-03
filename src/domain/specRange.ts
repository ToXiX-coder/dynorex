/**
 * Spec estimates are shown as a RANGE, never one exact number: baselines are owner-reported and the same part
 * makes different power on different cars, days and dynos. The point estimate (from completed mods) sits inside
 * the range. One rule everywhere (spec card, hero, power gauge, Torq):
 *   power and torque ±6%, rounded out to the nearest 5
 *   weight ±2%, rounded out to the nearest 10 lb
 *   0–60 ±7%, rounded out to 0.1 s
 *   power-to-weight ±8%, rounded out to 0.1 lb/hp
 * "Rounded out" means low rounds down and high rounds up, so the range always contains the estimate.
 *
 * A STOCK car (no completed mods) shows the owner's exact stock numbers, never a range: nothing has been
 * estimated yet. Ranges start with the first completed mod (planned and in-progress mods don't count).
 */
export type SpecField = "hp" | "torque" | "weight" | "zero_to_sixty" | "lb_per_hp";

const RULES: Record<SpecField, { pct: number; step: number; decimals: number }> = {
  hp: { pct: 0.06, step: 5, decimals: 0 },
  torque: { pct: 0.06, step: 5, decimals: 0 },
  weight: { pct: 0.02, step: 10, decimals: 0 },
  zero_to_sixty: { pct: 0.07, step: 0.1, decimals: 1 },
  lb_per_hp: { pct: 0.08, step: 0.1, decimals: 1 },
};

export type SpecRange = { low: number; high: number; decimals: number };

/** True when no completed mod has changed the numbers: show the exact stock figures. */
export function isStock(e: { completed_mods_counted?: number | string | null } | null | undefined) {
  return Number(e?.completed_mods_counted ?? 0) === 0;
}

export function specRange(field: SpecField, value: number): SpecRange | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const { pct, step, decimals } = RULES[field];
  // work in whole steps to avoid floating-point drift (0.1 steps)
  const lowSteps = Math.floor((value * (1 - pct)) / step + 1e-9);
  const highSteps = Math.ceil((value * (1 + pct)) / step - 1e-9);
  const round = (n: number) => Number((n * step).toFixed(decimals));
  return { low: round(Math.max(0, lowSteps)), high: round(Math.max(lowSteps + 1, highSteps)), decimals };
}

export function formatRange(r: SpecRange): string {
  return `${r.low.toFixed(r.decimals)}–${r.high.toFixed(r.decimals)}`;
}

/** Screen-reader wording: "about 270 to 305". */
export function sayRange(r: SpecRange): string {
  return `about ${r.low.toFixed(r.decimals)} to ${r.high.toFixed(r.decimals)}`;
}
