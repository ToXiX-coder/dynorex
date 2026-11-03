import type { Entry, OdometerUnit } from "./types";

/** Odometer readings from entries and shop confirmations, in date order, with any that go backwards flagged. */
export interface Reading {
  entryId: string;
  on: string;
  miles: number;
  source: "owner" | "shop";
  backwards: boolean;
}

export const toMiles = (n: number, unit: OdometerUnit) => (unit === "km" ? Math.round(n * 0.621371) : n);
/** Allow a little slack: two readings on the same day may be written from memory. */
const SLACK_MILES = 25;

export function readings(entries: Entry[]): Reading[] {
  const raw: Omit<Reading, "backwards">[] = [];
  for (const e of entries) {
    if (e.withdrawnAt) continue;
    if (e.odometer != null) raw.push({ entryId: e.id, on: e.performedOn, miles: toMiles(e.odometer, e.odometerUnit), source: "owner" });
    const c = e.confirmation;
    if (c?.decision === "confirmed" && c.odometer != null) {
      raw.push({ entryId: e.id, on: e.performedOn, miles: toMiles(c.odometer, e.odometerUnit), source: "shop" });
    }
  }
  raw.sort((a, b) => a.on.localeCompare(b.on) || a.miles - b.miles);
  let max = -Infinity;
  return raw.map((r) => {
    const backwards = r.miles + SLACK_MILES < max;
    max = Math.max(max, r.miles);
    return { ...r, backwards };
  });
}

/** Entry ids whose reading is lower than one recorded on an earlier date. */
export const backwardsEntries = (entries: Entry[]) =>
  new Set(readings(entries).filter((r) => r.backwards).map((r) => r.entryId));

export const formatMiles = (n: number) => `${n.toLocaleString("en-US")} mi`;
