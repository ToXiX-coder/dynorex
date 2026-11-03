import { MOD_CATEGORIES } from "./validation/build";

/**
 * D-68 "Build Wrapped": a year in the garage, counted only from the owner's own logs. No estimates are added, no
 * costs, VINs or places; power is the sum of the owner's own per-mod numbers and says so. Entries an earlier owner
 * logged (a car bought with its record) don't count as this owner's year.
 */
export interface WrappedInput {
  year: number;
  cars: { id: string; sold: boolean }[];
  mods: {
    vehicle_id: string;
    name: string;
    category: string;
    status: string;
    installed_on: string | null;
    status_changed_at: string;
    spec_deltas: Record<string, unknown>;
    installed_odometer?: number | null;
    deleted_at?: string | null;
    inherited_at?: string | null;
  }[];
  services: { vehicle_id: string; done_on: string; odometer: number | null; inherited_at?: string | null }[];
  /** phone-timed runs in the year */
  runs: number;
  /** meets checked in at, or null when meets aren't part of the app */
  meets: number | null;
}

export interface Wrapped {
  year: number;
  cars: number;
  modsFinished: number;
  topCategory: { label: string; count: number } | null;
  /** the owner's own hp numbers for mods finished this year, added up; null when none were entered */
  hpAdded: number | null;
  services: number;
  /** distance between the lowest and highest readings logged this year, per car, added up; null under two readings */
  miles: number | null;
  runs: number;
  meets: number | null;
  busiestMonth: string | null;
  newestMod: string | null;
  empty: boolean;
}

const KW_TO_HP = 1.341;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function hpOf(deltas: Record<string, unknown>): number | null {
  const hp = deltas.hp as { delta?: unknown; unit?: unknown } | undefined;
  if (!hp || typeof hp.delta !== "number" || !Number.isFinite(hp.delta)) return null;
  return hp.unit === "kw" ? hp.delta * KW_TO_HP : hp.delta;
}

export function buildWrapped(input: WrappedInput): Wrapped {
  const inYear = (d: string | null | undefined) => Boolean(d) && d!.slice(0, 4) === String(input.year);
  const finished = input.mods
    .filter((m) => !m.deleted_at && !m.inherited_at && m.status === "complete")
    .filter((m) => inYear(m.installed_on ?? m.status_changed_at))
    .sort((a, b) => (b.installed_on ?? b.status_changed_at).localeCompare(a.installed_on ?? a.status_changed_at));
  const services = input.services.filter((s) => !s.inherited_at && inYear(s.done_on));

  const byCategory = new Map<string, number>();
  for (const m of finished) byCategory.set(m.category, (byCategory.get(m.category) ?? 0) + 1);
  // a "most work on" only when one category really leads (a tie, or one mod each, isn't a lead)
  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0] && ranked[0][1] >= 2 && ranked[0][1] > (ranked[1]?.[1] ?? 0) ? ranked[0] : undefined;
  const label = (id: string) => MOD_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  const hps = finished.map((m) => hpOf(m.spec_deltas)).filter((n): n is number => n !== null);

  // per car: lowest to highest reading logged this year (service log plus mileage at install)
  const readings = new Map<string, number[]>();
  const add = (car: string, odo: number | null | undefined) => {
    if (odo == null || !Number.isFinite(Number(odo))) return;
    readings.set(car, [...(readings.get(car) ?? []), Number(odo)]);
  };
  for (const s of services) add(s.vehicle_id, s.odometer);
  for (const m of finished) add(m.vehicle_id, m.installed_odometer);
  const spans = [...readings.values()]
    .filter((r) => r.length >= 2)
    .map((r) => Math.max(...r) - Math.min(...r))
    .filter((n) => n > 0);

  const months = new Array<number>(12).fill(0);
  for (const m of finished) months[Number((m.installed_on ?? m.status_changed_at).slice(5, 7)) - 1]! += 1;
  for (const s of services) months[Number(s.done_on.slice(5, 7)) - 1]! += 1;
  const peak = Math.max(...months);

  return {
    year: input.year,
    cars: input.cars.filter((c) => !c.sold).length,
    modsFinished: finished.length,
    topCategory: top ? { label: label(top[0]), count: top[1] } : null,
    hpAdded: hps.length ? Math.round(hps.reduce((a, n) => a + n, 0)) : null,
    services: services.length,
    miles: spans.length ? spans.reduce((a, n) => a + n, 0) : null,
    runs: input.runs,
    meets: input.meets,
    busiestMonth: peak > 0 ? MONTHS[months.indexOf(peak)]! : null,
    newestMod: finished[0]?.name ?? null,
    empty: finished.length === 0 && services.length === 0 && input.runs === 0 && !input.meets,
  };
}
