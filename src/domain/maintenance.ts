import type { MaintenanceRecord } from "@/services/supabase/database.types";

/**
 * Maintenance log (D-58): private records per car, each with an optional next-due date and/or mileage. Common
 * jobs suggest a typical interval; it's only a starting point (the owner's manual wins) and the owner can change it.
 */
export const MAINTENANCE_PRESETS: readonly { title: string; miles: number | null; months: number | null }[] = [
  { title: "Oil change", miles: 5000, months: 6 },
  { title: "Tire rotation", miles: 6000, months: null },
  { title: "Brake pads", miles: null, months: null },
  { title: "Brake fluid flush", miles: null, months: 24 },
  { title: "Coolant flush", miles: 60000, months: 60 },
  { title: "Engine air filter", miles: 15000, months: null },
  { title: "Cabin air filter", miles: 15000, months: 12 },
  { title: "Spark plugs", miles: 60000, months: null },
  { title: "Transmission fluid", miles: 60000, months: null },
  { title: "Differential fluid", miles: 30000, months: null },
  { title: "Timing belt", miles: 60000, months: null },
  { title: "Wiper blades", miles: null, months: 12 },
  { title: "Battery", miles: null, months: null },
  { title: "Alignment", miles: null, months: 12 },
];

export const presetFor = (title: string) =>
  MAINTENANCE_PRESETS.find((p) => p.title.toLowerCase() === title.trim().toLowerCase()) ?? null;

/** "Due soon": within 30 days or 500 miles. */
/** Highest odometer reading the database accepts (maintenance_records check). */
export const ODO_MAX = 2_000_000;
export const SOON_DAYS = 30;
export const SOON_MILES = 500;

export type DueState = "overdue" | "soon" | "ok" | "none";
export type Due = { state: DueState; days: number | null; miles: number | null };

const dayMs = 86_400_000;
const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

/** How close a record's next service is, by date and/or by the car's current odometer (the sooner one wins). */
export function dueStatus(
  r: Pick<MaintenanceRecord, "next_due_on" | "next_due_odometer">,
  odometer: number | null,
  today = new Date(),
): Due {
  const days = r.next_due_on ? Math.round((parseDay(r.next_due_on) - dayOf(today)) / dayMs) : null;
  const miles = r.next_due_odometer !== null && odometer !== null ? r.next_due_odometer - odometer : null;
  if (days === null && miles === null) return { state: "none", days, miles };
  const over = (days !== null && days < 0) || (miles !== null && miles <= 0);
  const soon = (days !== null && days <= SOON_DAYS) || (miles !== null && miles <= SOON_MILES);
  return { state: over ? "overdue" : soon ? "soon" : "ok", days, miles };
}

/** "Due in 12 days", "Overdue by 300 mi", "Due in 1,800 mi or 85 days". */
export function dueText(d: Due): string {
  if (d.state === "none") return "No reminder set";
  const parts: string[] = [];
  if (d.miles !== null) parts.push(`${Math.abs(d.miles).toLocaleString()} mi`);
  if (d.days !== null) parts.push(`${Math.abs(d.days)} day${Math.abs(d.days) === 1 ? "" : "s"}`);
  if (d.state === "overdue") {
    const late = [
      d.miles !== null && d.miles <= 0 ? `${Math.abs(d.miles).toLocaleString()} mi` : null,
      d.days !== null && d.days < 0 ? `${Math.abs(d.days)} day${d.days === -1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return late.length ? `Overdue by ${late.join(" / ")}` : "Due today";
  }
  if (d.days === 0) return "Due today";
  return `Due in ${parts.join(" or ")}`;
}

/** Suggested next-due values for a preset, from when (and at what mileage) the job was done. */
export function suggestNextDue(
  title: string,
  doneOn: string,
  odometer: number | null,
): { next_due_on: string | null; next_due_odometer: number | null } {
  const p = presetFor(title);
  if (!p) return { next_due_on: null, next_due_odometer: null };
  let next_due_on: string | null = null;
  if (p.months) {
    const [y, m, d] = doneOn.split("-").map(Number);
    const t = new Date(Date.UTC(y!, m! - 1 + p.months, d!));
    next_due_on = t.toISOString().slice(0, 10);
  }
  return { next_due_on, next_due_odometer: p.miles && odometer !== null ? odometer + p.miles : null };
}

/** The newest record of each job (same title, any case); older ones are history (D-68: "Log again" sits there). */
export function latestPerJob<T extends { title: string; done_on: string; created_at: string }>(records: readonly T[]): T[] {
  const seen = new Set<string>();
  return [...records]
    .sort((a, b) => b.done_on.localeCompare(a.done_on) || b.created_at.localeCompare(a.created_at))
    .filter((r) => {
      const k = r.title.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Most urgent first: overdue, then soon, then by days/miles left. */
export function byUrgency(a: Due, b: Due): number {
  const rank = { overdue: 0, soon: 1, ok: 2, none: 3 } as const;
  const left = (d: Due) => Math.min(d.days ?? Infinity, d.miles !== null ? d.miles / 40 : Infinity);
  return rank[a.state] - rank[b.state] || left(a) - left(b);
}
