/**
 * Spec estimates: baseline + deltas from COMPLETE mods only. Mirrors public.vehicle_spec_estimate()
 * exactly (tests/integration/specs.test.ts runs both on the same data). The database result is what the
 * app shows; this copy is for live previews in forms.
 *
 * Units: hp, lb-ft, lb, seconds. kW / Nm / kg deltas are converted. Sign convention: positive = more
 * (more power, more weight, slower 0-60). Rounding: hp, torque, weight to whole numbers; 0-60 and lb/hp
 * to one decimal; half away from zero.
 */

export const SPEC_DISCLAIMER = "Estimates based on user-reported data. Dynorex is not responsible for accuracy.";

export type SpecField = "hp" | "torque" | "weight" | "zero_to_sixty";
export type SpecStatus = "estimate" | "unknown" | "invalid";

export const SPEC_UNITS = {
  hp: ["hp", "kw"],
  torque: ["lb-ft", "nm"],
  weight: ["lb", "kg"],
  zero_to_sixty: ["s"],
} as const satisfies Record<SpecField, readonly string[]>;

export const DELTA_LIMITS: Record<SpecField, number> = { hp: 2000, torque: 2000, weight: 5000, zero_to_sixty: 30 };

type UnitOf<F extends SpecField> = (typeof SPEC_UNITS)[F][number];
export type SpecDeltas = { schema_version: 1 } & { [F in SpecField]?: { delta: number; unit: UnitOf<F> } };

const TO_BASE: Record<string, number> = { hp: 1, kw: 1.341022, "lb-ft": 1, nm: 0.737562, lb: 1, kg: 2.204623, s: 1 };

export function deltaInBaseUnit(d: SpecDeltas | null | undefined, field: SpecField): number {
  const v = d?.[field];
  if (!v) return 0;
  return v.delta * (TO_BASE[v.unit] ?? NaN);
}

/** Postgres round(numeric, n): half away from zero. */
export function roundHalfAway(x: number, decimals = 0): number {
  const f = 10 ** decimals;
  // epsilon guards binary floating error such as 1.005 * 100 = 100.49999
  return (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9)) / f;
}

export interface Baseline {
  baseline_hp: number | null;
  baseline_torque_lbft: number | null;
  baseline_weight_lb: number | null;
  baseline_zero_to_sixty_s: number | null;
  /** D-71: an e-bike's weight is sane from 10 lb; everything else keeps the 100 lb floor */
  kind?: string | null;
}

export interface ModForSpecs {
  status: "planned" | "in_progress" | "complete";
  spec_deltas: SpecDeltas | null;
  deleted_at?: string | null;
}

export interface SpecEstimate {
  hp: number | null;
  hp_status: SpecStatus;
  torque_lbft: number | null;
  torque_status: SpecStatus;
  weight_lb: number | null;
  weight_status: SpecStatus;
  zero_to_sixty_s: number | null;
  zero_to_sixty_status: SpecStatus;
  lb_per_hp: number | null;
  lb_per_hp_status: SpecStatus;
  completed_mods_counted: number;
  pending_hp_delta: number;
  pending_torque_delta: number;
  pending_weight_delta: number;
  pending_zero_to_sixty_delta: number;
}

const RANGES: Record<SpecField, [number, number]> = {
  hp: [0, 5000],
  torque: [0, 5000],
  weight: [100, 20000],
  zero_to_sixty: [0, 60],
};

function check(value: number | null, field: SpecField, lowest?: number): SpecStatus {
  if (value === null || Number.isNaN(value)) return "unknown";
  const [floor, hi] = RANGES[field];
  const lo = lowest ?? floor;
  return value <= lo || value >= hi ? "invalid" : "estimate";
}

export function estimateSpecs(base: Baseline, mods: ModForSpecs[]): SpecEstimate {
  const live = mods.filter((m) => !m.deleted_at);
  const done = live.filter((m) => m.status === "complete");
  const pending = live.filter((m) => m.status === "planned" || m.status === "in_progress");
  const sum = (list: ModForSpecs[], f: SpecField) => list.reduce((a, m) => a + deltaInBaseUnit(m.spec_deltas, f), 0);
  const add = (b: number | null, f: SpecField) => (b === null ? null : b + sum(done, f));

  const hp = add(base.baseline_hp, "hp");
  const tq = add(base.baseline_torque_lbft, "torque");
  const wt = add(base.baseline_weight_lb, "weight");
  const zs = add(base.baseline_zero_to_sixty_s, "zero_to_sixty");
  const hs = check(hp, "hp");
  const ts = check(tq, "torque");
  const ws = check(wt, "weight", base.kind === "ebike" ? 10 : undefined);
  const zss = check(zs, "zero_to_sixty");

  return {
    hp: hs === "estimate" ? roundHalfAway(hp!) : null,
    hp_status: hs,
    torque_lbft: ts === "estimate" ? roundHalfAway(tq!) : null,
    torque_status: ts,
    weight_lb: ws === "estimate" ? roundHalfAway(wt!) : null,
    weight_status: ws,
    zero_to_sixty_s: zss === "estimate" ? roundHalfAway(zs!, 1) : null,
    zero_to_sixty_status: zss,
    lb_per_hp: hs === "estimate" && ws === "estimate" ? roundHalfAway(wt! / hp!, 1) : null,
    lb_per_hp_status:
      hs === "estimate" && ws === "estimate"
        ? "estimate"
        : hs === "invalid" || ws === "invalid"
          ? "invalid"
          : "unknown",
    completed_mods_counted: done.length,
    pending_hp_delta: roundHalfAway(sum(pending, "hp"), 1),
    pending_torque_delta: roundHalfAway(sum(pending, "torque"), 1),
    pending_weight_delta: roundHalfAway(sum(pending, "weight"), 1),
    pending_zero_to_sixty_delta: roundHalfAway(sum(pending, "zero_to_sixty"), 2),
  };
}

/** Display: "245" / "—" with a reason. Never shows a number for unknown or invalid. */
export function formatSpec(value: number | null, status: SpecStatus, decimals = 0): string {
  if (status === "unknown") return "—";
  if (status === "invalid") return "Check";
  return value === null ? "—" : value.toFixed(decimals);
}
