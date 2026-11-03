import { isCarbEo } from "./compliance";
import type { Entry } from "./types";

/**
 * What a buyer can weigh, per entry. Every label says who said what and when; none of them is Buildmark
 * vouching for the car. Buildmark never calls anything "verified": the research found that word is both
 * the platform's own claim (outside Section 230) and already cheapened by rivals.
 */

export type Level = 0 | 1 | 2 | 3;
export const LEVELS: { level: Level; name: string; meaning: string }[] = [
  { level: 0, name: "Owner-entered", meaning: "The owner wrote this entry." },
  { level: 1, name: "Receipt attached", meaning: "A receipt or dyno sheet was uploaded with it." },
  { level: 2, name: "Part identified", meaning: "A part number or CARB EO number is recorded." },
  { level: 3, name: "Shop-confirmed", meaning: "The shop named confirmed the work through a link sent to it." },
];

export type FlagId = "withdrawn" | "edited_after_confirmation" | "shop_declined" | "logged_late";
export interface Flag {
  id: FlagId;
  text: string;
}

/** Entries logged more than this long after the work are marked as written from memory or old paperwork. */
export const LATE_DAYS = 30;

const DAY = 86_400_000;
export const daysBetween = (fromIsoDate: string, toIso: string) =>
  Math.floor((Date.parse(toIso) - Date.parse(`${fromIsoDate}T00:00:00Z`)) / DAY);

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function evidence(e: Entry): { level: Level; labels: string[]; flags: Flag[] } {
  const labels = ["Owner-entered"];
  const flags: Flag[] = [];
  let level: Level = 0;

  for (const kind of ["receipt", "dyno_sheet"] as const) {
    const files = e.receipts.filter((r) => r.kind === kind);
    if (files.length === 0) continue;
    level = 1;
    const first = formatDate(files.map((r) => r.uploadedAt).sort()[0]!);
    const word = kind === "receipt" ? "Receipt" : "Dyno sheet";
    labels.push(files.length === 1 ? `${word} uploaded ${first}` : `${files.length} ${word.toLowerCase()}s, first uploaded ${first}`);
  }
  if (e.carbEo && isCarbEo(e.carbEo)) {
    level = 2;
    labels.push(`CARB EO ${e.carbEo}`);
  } else if (e.partNumber) {
    level = 2;
    labels.push(`Part no. ${e.partNumber}`);
  }

  const c = e.confirmation;
  if (c?.decision === "confirmed") {
    const where = c.shopCity ? `${c.shopName}, ${c.shopCity}` : c.shopName;
    labels.push(`Confirmed by ${where} on ${formatDate(c.at)}`);
    if (c.rev === e.rev) level = 3;
    else flags.push({ id: "edited_after_confirmation", text: "Edited after the shop confirmed it" });
  } else if (c?.decision === "declined") {
    flags.push({ id: "shop_declined", text: `${c.shopName} declined to confirm this` });
  }

  const late = daysBetween(e.performedOn, e.createdAt);
  if (late > LATE_DAYS) flags.push({ id: "logged_late", text: `Logged ${late} days after the work` });
  if (e.withdrawnAt) flags.unshift({ id: "withdrawn", text: e.withdrawReason ? `Withdrawn: ${e.withdrawReason}` : "Withdrawn by the owner" });

  return { level: e.withdrawnAt ? 0 : level, labels, flags };
}

/** Which steps an entry actually has: they aren't cumulative (a shop can confirm work with no receipt on file). */
export function evidenceSteps(e: Entry): boolean[] {
  if (e.withdrawnAt) return [true, false, false, false];
  return [
    true,
    e.receipts.length > 0,
    Boolean((e.carbEo && isCarbEo(e.carbEo)) || e.partNumber),
    e.confirmation?.decision === "confirmed" && e.confirmation.rev === e.rev,
  ];
}

/** Counts for the top of a record. */
export function summary(entries: Entry[]) {
  const live = entries.filter((e) => !e.withdrawnAt);
  return {
    entries: live.length,
    withReceipts: live.filter((e) => e.receipts.some((r) => r.kind === "receipt")).length,
    shopConfirmed: live.filter((e) => evidence(e).level === 3).length,
    flagged: live.filter((e) => evidence(e).flags.length > 0).length,
  };
}
