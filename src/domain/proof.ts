import type { DynoBrand, DynoCorrection, LapSource } from "@/services/supabase/database.types";

/**
 * D-62 rules for the dyno log, track laps and the insurance mod list. Pure, so they're unit-tested.
 */

// ---------------------------------------------------------------- dyno log

export const DYNO_BRANDS: readonly { id: DynoBrand; label: string }[] = [
  { id: "dynojet", label: "Dynojet" },
  { id: "mustang", label: "Mustang" },
  { id: "dynapack", label: "Dynapack" },
  { id: "mainline", label: "Mainline" },
  { id: "superflow", label: "SuperFlow" },
  { id: "other", label: "Other" },
];
export const CORRECTIONS: readonly { id: DynoCorrection; label: string }[] = [
  { id: "sae", label: "SAE" },
  { id: "std", label: "STD" },
  { id: "uncorrected", label: "Uncorrected" },
  { id: "unknown", label: "Not sure" },
];
export const dynoLabel = (id: DynoBrand) => DYNO_BRANDS.find((d) => d.id === id)?.label ?? id;
export const OWNER_REPORTED = "Owner-reported from a shop's dyno sheet. Not checked by Dynorex.";

type DynoLike = { measured_on: string; dyno: DynoBrand; correction: DynoCorrection; whp: number };
type ModLike = { id: string; name: string; status: string; installed_on: string | null };

/**
 * What each finished mod changed on the dyno: the last result before it was installed against the first one after,
 * but only when both were on the same brand of dyno with the same correction (different dynos read differently,
 * so comparing across them would mislead). Mods without such a pair are left out.
 */
export function dynoImpact(results: readonly DynoLike[], mods: readonly ModLike[]) {
  const sorted = [...results].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const out: { modId: string; name: string; before: number; after: number; delta: number; dyno: DynoBrand }[] = [];
  for (const m of mods) {
    if (m.status !== "complete" || !m.installed_on) continue;
    const day = m.installed_on;
    const before = [...sorted].reverse().find((r) => r.measured_on < day);
    const after =
      before &&
      sorted.find((r) => r.measured_on >= day && r.dyno === before.dyno && r.correction === before.correction);
    if (!before || !after) continue;
    out.push({
      modId: m.id,
      name: m.name,
      before: before.whp,
      after: after.whp,
      delta: Math.round((after.whp - before.whp) * 10) / 10,
      dyno: before.dyno,
    });
  }
  return out;
}

// ---------------------------------------------------------------- track laps

export const LAP_SOURCES: readonly { id: LapSource; label: string }[] = [
  { id: "racechrono", label: "RaceChrono" },
  { id: "harrys", label: "Harry's LapTimer" },
  { id: "trackaddict", label: "TrackAddict" },
  { id: "aim", label: "AiM" },
  { id: "other", label: "Other timer" },
  { id: "manual", label: "Stopwatch / by hand" },
];
export const lapSourceLabel = (id: LapSource) => LAP_SOURCES.find((s) => s.id === id)?.label ?? id;

export const LAP_MIN_MS = 20_000;
export const LAP_MAX_MS = 1_800_000;

/** "1:42.31", "1:42.310", "102.31" or "0:59.9" to milliseconds; null if it isn't a believable lap time. */
export function parseLapTime(s: string): number | null {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,4})(?:[.,](\d{1,3}))?\s*$/.exec(s);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const sec = Number(m[2]);
  if (m[1] && sec >= 60) return null;
  const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
  const ms = (min * 60 + sec) * 1000 + frac;
  return ms >= LAP_MIN_MS && ms <= LAP_MAX_MS ? ms : null;
}

/** 102310 -> "1:42.31" (hundredths, like most lap timers). */
export function formatLap(ms: number): string {
  const cs = Math.round(ms / 10);
  const min = Math.floor(cs / 6000);
  const rest = (cs % 6000) / 100;
  return `${min}:${rest.toFixed(2).padStart(5, "0")}`;
}

/**
 * Lap times pulled out of whatever a lap-timer app exports or a person pastes (a list, a CSV of laps): every
 * "m:ss.xx" in the text, in order. Plain seconds, and clock times without a fraction, only count alone on a line, so
 * dates, times of day and other numbers in an export don't sneak in.
 */
export function parseLapList(text: string): number[] {
  const out: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clock = line.match(/\b\d{1,2}:\d{2}(?:[.,]\d{1,3})?\b/g);
    if (clock) {
      for (const c of clock) {
        // lap timers always show fractions of a second; a bare "09:14" in an export is a time of day (unless it's
        // all that was typed on the line)
        if (!/[.,]\d/.test(c) && line.trim() !== c) continue;
        const ms = parseLapTime(c);
        if (ms !== null) out.push(ms);
      }
      continue;
    }
    const ms = parseLapTime(line);
    if (ms !== null) out.push(ms);
  }
  return out.slice(0, 100);
}

// ---------------------------------------------------------------- insurance mod list

type InsuranceMod = {
  name: string;
  brand: string | null;
  part_number: string | null;
  installed_on: string | null;
  installed_by?: string | null;
  /** D-68: mileage when it was fitted */
  installed_odometer?: number | null;
  cost_minor: number | null;
  currency: string | null;
  receipt: boolean;
};

const miles = (m: InsuranceMod) =>
  m.installed_odometer != null ? `${Number(m.installed_odometer).toLocaleString("en-US")} mi` : null;

export function insuranceTotals(mods: readonly InsuranceMod[]) {
  const priced = mods.filter((m) => m.cost_minor !== null);
  const currency = priced[0]?.currency ?? "USD";
  return {
    count: mods.length,
    priced: priced.length,
    receipts: mods.filter((m) => m.receipt).length,
    totalMinor: priced.filter((m) => m.currency === currency).reduce((a, m) => a + Number(m.cost_minor), 0),
    currency,
    mixedCurrency: priced.some((m) => m.currency !== currency),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

/** The list as plain text (to share or paste into an insurer's form). */
export function insuranceText(car: string, mods: readonly InsuranceMod[], madeOn: string): string {
  const t = insuranceTotals(mods);
  const lines = mods.map((m) =>
    [
      m.name,
      m.brand,
      m.part_number ? `part ${m.part_number}` : null,
      m.installed_on ? `fitted ${m.installed_on}` : null,
      miles(m) ? `at ${miles(m)}` : null,
      m.installed_by ? `by ${m.installed_by}` : null,
      m.cost_minor !== null && m.currency ? money(Number(m.cost_minor), m.currency) : null,
      m.receipt ? "receipt kept" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  return [
    `Modifications: ${car}`,
    `Made ${madeOn} from the owner's Dynorex garage.`,
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    `${t.count} modifications, ${money(t.totalMinor, t.currency)} recorded${t.mixedCurrency ? " (other currencies not added)" : ""}, ${t.receipts} with receipts.`,
  ].join("\n");
}

/** The same list as a printable page (a PDF on phones). */
export function insuranceHtml(car: string, mods: readonly InsuranceMod[], madeOn: string): string {
  const t = insuranceTotals(mods);
  const rows = mods
    .map(
      (m) =>
        `<tr><td>${esc(m.name)}${m.brand ? `<br><small>${esc(m.brand)}</small>` : ""}</td><td>${esc(m.part_number ?? "")}</td><td>${esc(m.installed_on ?? "")}${miles(m) ? `<br><small>${esc(miles(m)!)}</small>` : ""}</td><td>${esc(m.installed_by ?? "")}</td><td class="n">${m.cost_minor !== null && m.currency ? esc(money(Number(m.cost_minor), m.currency)) : ""}</td><td>${m.receipt ? "Yes" : ""}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111315;margin:32px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#555;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}
th{background:#f2efe8}.n{text-align:right;white-space:nowrap}small{color:#666}tfoot td{font-weight:700;border-top:2px solid #111315}
</style></head><body>
<h1>Modifications: ${esc(car)}</h1>
<p>Made ${esc(madeOn)} from the owner's Dynorex garage. Entered by the owner; receipts are kept by the owner.</p>
<table><thead><tr><th>Part</th><th>Part number</th><th>Fitted on</th><th>Fitted by</th><th class="n">Cost</th><th>Receipt</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="4">${t.count} modifications${t.mixedCurrency ? " (other currencies not added)" : ""}</td><td class="n">${esc(money(t.totalMinor, t.currency))}</td><td>${t.receipts}</td></tr></tfoot></table>
</body></html>`;
}
