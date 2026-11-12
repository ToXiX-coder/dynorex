import type { BuildRecord, Compliance, DynoBrand, ModCategory, RecordEntry } from "@/services/supabase/database.types";
import { dynoLabel } from "./proof";

/**
 * D-64: the Build Record. What a buyer can weigh, per entry, and the listing export. Every label says who said
 * what and when; none of them is Dynorex vouching for the car, and nothing is ever called "verified".
 * The database enforces the same rules (supabase/migrations/20261026000000_build_record.sql).
 */

export type Level = 0 | 1 | 2 | 3;
export const LEVELS: { level: Level; name: string; meaning: string }[] = [
  { level: 0, name: "Owner-entered", meaning: "The owner logged it." },
  { level: 1, name: "Paperwork on file", meaning: "A receipt or dyno sheet was uploaded with it." },
  { level: 2, name: "Part identified", meaning: "A part number or CARB EO number is recorded." },
  { level: 3, name: "Shop-confirmed", meaning: "The shop named confirmed the work." },
];

/** Logged more than this long after the work: written from memory or old paperwork. */
export const LATE_DAYS = 30;

// ---------------------------------------------------------------- emissions status

/** Engine and exhaust parts always touch emissions; electronics may (a tune) or may not (a stereo). */
export const EMISSIONS_CATEGORIES: readonly ModCategory[] = ["engine", "exhaust", "electronics"];
export const COMPLIANCE_LABELS: Record<Compliance, string> = {
  carb_eo: "CARB EO",
  stock: "Back to the factory part",
  off_road_only: "Off-road use only",
  unknown: "Emissions status not recorded",
  not_emissions_related: "Not emissions-related",
};
/** The choices the mod form offers for a category; empty when the question doesn't apply. */
export function complianceChoices(category: ModCategory): Compliance[] {
  if (category === "engine" || category === "exhaust") return ["carb_eo", "stock", "off_road_only", "unknown"];
  if (category === "electronics") return ["not_emissions_related", "carb_eo", "stock", "off_road_only", "unknown"];
  return [];
}
export const normalizeCarbEo = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
export const isCarbEo = (s: string) => /^D-\d{1,4}-\d{1,3}$/.test(normalizeCarbEo(s));

export type ConfirmBlock =
  "removed" | "earlier_owner" | "not_finished" | "dyno" | "emissions" | "already_confirmed" | null;

/** Why a shop can't be asked about this entry, or null when it can. Mirrors record_confirm_block. */
export function confirmBlock(e: RecordEntry): ConfirmBlock {
  if (e.removed_at) return "removed";
  if (e.earlier_owner) return "earlier_owner";
  if (e.type === "dyno") return "dyno";
  if (e.reopened) return "not_finished";
  if (
    e.type === "mod" &&
    e.category &&
    EMISSIONS_CATEGORIES.includes(e.category) &&
    !["carb_eo", "stock", "not_emissions_related"].includes(e.compliance ?? "unknown")
  )
    return "emissions";
  if (e.confirmation?.decision === "confirmed" && e.confirmation.version === e.version) return "already_confirmed";
  return null;
}
export const CONFIRM_BLOCK_COPY: Record<Exclude<ConfirmBlock, null>, string> = {
  removed: "This entry was removed.",
  earlier_owner: "An earlier owner logged this. It stays as they left it.",
  not_finished: "Mark the mod Complete first.",
  dyno: "Dyno results are owner-reported; attach the shop's sheet instead.",
  emissions:
    "Shops aren't asked to confirm emissions-related parts without a CARB EO number, to protect them. Add the EO number if the part has one.",
  already_confirmed: "The shop has confirmed this version of the entry.",
};

// ---------------------------------------------------------------- evidence

const DAY = 86_400_000;
const day = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export const recordDate = day;

export type FlagId =
  "removed" | "reopened" | "edited_after_confirmation" | "shop_declined" | "logged_late" | "odometer";
export interface Flag {
  id: FlagId;
  text: string;
}

export function evidence(
  e: RecordEntry,
  backwards?: ReadonlySet<string>,
): { level: Level; labels: string[]; flags: Flag[] } {
  const labels: string[] = [e.earlier_owner ? "Logged by an earlier owner" : "Owner-entered"];
  const flags: Flag[] = [];
  let level: Level = 0;

  if (e.receipts.length) {
    level = 1;
    const first = day([...e.receipts].map((r) => r.uploaded_at).sort()[0]!);
    labels.push(
      e.receipts.length === 1 ? `Receipt uploaded ${first}` : `${e.receipts.length} receipts, first uploaded ${first}`,
    );
  }
  if (e.has_sheet) {
    level = 1;
    labels.push("Dyno sheet on file");
  }
  if (e.carb_eo && isCarbEo(e.carb_eo)) {
    level = 2;
    labels.push(`CARB EO ${e.carb_eo}`);
  } else if (e.part_number) {
    level = 2;
    labels.push(`Part no. ${e.part_number}`);
  }

  const c = e.confirmation;
  if (c?.decision === "confirmed") {
    const who = c.shop_city ? `${c.shop_name}, ${c.shop_city}` : c.shop_name;
    labels.push(
      `Confirmed by ${who} ${c.via === "shop_account" ? "(Dynorex shop)" : "(through a link)"} on ${day(c.at)}`,
    );
    if (c.version === e.version) level = 3;
    else flags.push({ id: "edited_after_confirmation", text: "Edited after the shop confirmed it" });
  } else if (c?.decision === "declined") {
    flags.push({ id: "shop_declined", text: `${c.shop_name} declined to confirm this` });
  }
  if (e.version > 0)
    labels.push(`Edited ${e.version === 1 ? "once" : `${e.version} times`}, last on ${day(e.revisions.at(-1)!.at)}`);

  const late = Math.floor((Date.parse(e.logged_at) - Date.parse(`${e.date}T00:00:00Z`)) / DAY);
  if (late > LATE_DAYS) flags.push({ id: "logged_late", text: `Logged ${late} days after the work` });
  if (backwards?.has(e.id)) flags.push({ id: "odometer", text: "Odometer lower than an earlier entry" });
  if (e.reopened) flags.unshift({ id: "reopened", text: "Marked not finished after it was logged" });
  if (e.removed_at) flags.unshift({ id: "removed", text: `Removed by the owner on ${day(e.removed_at)}` });

  return { level: e.removed_at || e.reopened ? 0 : level, labels, flags };
}

/**
 * Which of the four steps an entry actually has. They aren't cumulative (a shop can confirm a job with no receipt
 * on file), so the ladder lights each one only when it's there; `evidence().level` is the highest one reached.
 */
export function evidenceSteps(e: RecordEntry): [boolean, boolean, boolean, boolean] {
  if (e.removed_at || e.reopened) return [true, false, false, false];
  return [
    true,
    e.receipts.length > 0 || e.has_sheet,
    Boolean((e.carb_eo && isCarbEo(e.carb_eo)) || e.part_number),
    e.confirmation?.decision === "confirmed" && e.confirmation.version === e.version,
  ];
}

/** Service entries whose odometer is lower than one logged on an earlier date (25 miles of slack). */
export function backwardsOdometer(entries: readonly RecordEntry[]): Set<string> {
  const live = entries
    .filter((e) => e.odometer != null && !e.removed_at)
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer! - b.odometer!);
  const out = new Set<string>();
  let max = -Infinity;
  for (const e of live) {
    if (e.odometer! + 25 < max) out.add(e.id);
    max = Math.max(max, e.odometer!);
  }
  return out;
}

export function recordSummary(entries: readonly RecordEntry[]) {
  const live = entries.filter((e) => !e.removed_at);
  const back = backwardsOdometer(entries);
  return {
    entries: live.length,
    withPaperwork: live.filter((e) => e.receipts.length > 0 || e.has_sheet).length,
    shopConfirmed: live.filter((e) => evidence(e).level === 3).length,
    flagged: entries.filter((e) => evidence(e, back).flags.length > 0).length,
  };
}

/**
 * The record at a glance: every live entry, oldest first, as the highest step it reached. The record screen draws
 * it as a strip of marks, so an owner sees in one look how much of the build is backed up.
 */
export function recordStrip(entries: readonly RecordEntry[]): Level[] {
  return entries
    .filter((e) => !e.removed_at)
    .sort((a, b) => a.date.localeCompare(b.date) || a.logged_at.localeCompare(b.logged_at))
    .map((e) => evidence(e).level);
}

/**
 * What would back the record up most, right now: the newest of the owner's own finished mods and dyno runs with
 * nothing on file (no receipt, sheet, part number or shop confirmation). Earlier owners' entries are read-only, and
 * service entries take receipts on the service log, so neither is suggested.
 */
export function nextPaperwork(entries: readonly RecordEntry[]): RecordEntry | null {
  const bare = entries.filter(
    (e) => !e.removed_at && !e.reopened && !e.earlier_owner && e.type !== "maintenance" && evidence(e).level === 0,
  );
  return [...bare].sort((a, b) => b.date.localeCompare(a.date) || b.logged_at.localeCompare(a.logged_at))[0] ?? null;
}

// ---------------------------------------------------------------- listing export

export const RECORD_DISCLAIMER =
  "Entries are written by the car's owners. Where marked, the shop named confirmed the work. Dynorex doesn't inspect cars or check records.";

const TYPE_WORD: Record<RecordEntry["type"], string> = { mod: "Mod", maintenance: "Service", dyno: "Dyno" };
export const carName = (c: BuildRecord["car"]) => [c.year, c.make, c.model, c.trim].filter(Boolean).join(" ");

function line(e: RecordEntry, back: ReadonlySet<string>): string {
  const ev = evidence(e, back);
  const bits = [day(e.date)];
  if (e.odometer != null) bits.push(`${e.odometer.toLocaleString("en-US")} mi`);
  bits.push(`${TYPE_WORD[e.type]}: ${[e.brand, e.title].filter(Boolean).join(" ")}`);
  if (e.type === "dyno") {
    bits.push([e.whp && `${e.whp} whp`, e.wtq && `${e.wtq} wtq`].filter(Boolean).join(" / ") + ", owner-reported");
  }
  if (e.installed_by) bits.push(`${e.type === "dyno" ? "at" : "by"} ${e.installed_by}`);
  if (
    e.type === "mod" &&
    e.category &&
    EMISSIONS_CATEGORIES.includes(e.category) &&
    e.compliance !== "not_emissions_related"
  ) {
    bits.push(e.carb_eo ? `CARB EO ${e.carb_eo}` : COMPLIANCE_LABELS[e.compliance ?? "unknown"]);
  }
  const marks: string[] = [];
  if (e.receipts.length) marks.push("receipt");
  if (e.has_sheet) marks.push("dyno sheet");
  if (ev.level === 3) marks.push("shop-confirmed");
  if (e.earlier_owner) marks.push("earlier owner");
  for (const f of ev.flags) marks.push(f.text.toLowerCase());
  return `- ${bits.join(" · ")}${marks.length ? ` [${marks.join("; ")}]` : ""}`;
}

/** Plain text to paste into an auction listing or classified ad. */
export function buildSheetText(rec: BuildRecord, link: string | null): string {
  const back = backwardsOdometer(rec.entries);
  const s = recordSummary(rec.entries);
  const live = rec.entries.filter((e) => !e.removed_at).sort((a, b) => a.date.localeCompare(b.date));
  const removed = rec.entries.length - live.length;
  const out = [
    `${carName(rec.car)}: Build Record`,
    `${s.entries} entries · ${s.withPaperwork} with paperwork · ${s.shopConfirmed} shop-confirmed · ${rec.owners} ${rec.owners === 1 ? "owner" : "owners"} on Dynorex`,
    "",
    ...live.map((e) => line(e, back)),
  ];
  if (removed)
    out.push("", `${removed} removed ${removed === 1 ? "entry is" : "entries are"} shown on the live record.`);
  if (link) out.push("", `Full record, with dates, paperwork and edit history: ${link}`);
  out.push("", RECORD_DISCLAIMER);
  return out.join("\n");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const mileage = (rec: BuildRecord) =>
  rec.odometer != null ? `${rec.odometer.toLocaleString("en-US")} ${rec.odometer_unit}` : null;

/**
 * D-68: a short ad for Marketplace or Craigslist: the car, its mileage, the newest finished mods and services, and
 * the buyer's link for the rest. Only what's on the record, worded as the owner's; no price, no selling claims.
 */
export function listingAdText(rec: BuildRecord, link: string | null, maxMods = 8): string {
  const s = recordSummary(rec.entries);
  const live = rec.entries.filter((e) => !e.removed_at && !e.reopened);
  const mods = live.filter((e) => e.type === "mod");
  const services = live.filter((e) => e.type === "maintenance").slice(0, 3);
  const dyno = live.find((e) => e.type === "dyno" && e.whp);
  const modLine = (e: RecordEntry) => {
    const marks = [e.receipts.length ? "receipt" : null, evidence(e).level === 3 ? "shop-confirmed" : null].filter(
      Boolean,
    );
    return `- ${[e.brand, e.title].filter(Boolean).join(" ")}${e.installed_by && e.installed_by.toLowerCase() !== "self" ? `, fitted by ${e.installed_by}` : ""}${marks.length ? ` (${marks.join(", ")})` : ""}`;
  };
  const out = [
    [carName(rec.car), mileage(rec)].filter(Boolean).join(" · "),
    `Modified, with a Build Record: ${s.entries} ${s.entries === 1 ? "entry" : "entries"}, ${s.withPaperwork} with paperwork, ${s.shopConfirmed} shop-confirmed.`,
  ];
  if (mods.length) {
    out.push("", "Mods:", ...mods.slice(0, maxMods).map(modLine));
    if (mods.length > maxMods) out.push(`+ ${mods.length - maxMods} more on the record`);
  }
  if (services.length) {
    out.push(
      "",
      `Service: ${services.map((e) => `${e.title} ${day(e.date)}${e.odometer != null ? ` at ${e.odometer.toLocaleString("en-US")} mi` : ""}`).join("; ")}`,
    );
  }
  if (dyno) {
    const on = dyno.dyno && dyno.dyno !== "other" ? `a ${dynoLabel(dyno.dyno as DynoBrand)}` : "a dyno";
    out.push("", `Dyno: ${dyno.whp} whp on ${on} (owner-reported)`);
  }
  if (link) out.push("", `Full record with paperwork, shop confirmations and edit history: ${link}`);
  out.push("", RECORD_DISCLAIMER);
  return out.join("\n");
}

/**
 * The record as a one-page sheet for a PDF (D-68: a for-sale sheet for the car's window or a listing attachment).
 * With a buyer's link, its QR code (`qr`, an SVG string) opens the live record.
 */
export function buildSheetHtml(rec: BuildRecord, link: string | null, qr: string | null = null): string {
  const back = backwardsOdometer(rec.entries);
  const s = recordSummary(rec.entries);
  const live = rec.entries.filter((e) => !e.removed_at).sort((a, b) => b.date.localeCompare(a.date));
  // under its own heading a line doesn't need its "Mod:" / "Service:" / "Dyno: Dyno run" prefix
  const items = (type: RecordEntry["type"]) =>
    live
      .filter((e) => e.type === type)
      .map((e) => line(e, back).slice(2).replace(` · ${TYPE_WORD[e.type]}: `, " · ").replace(" · Dyno run", ""))
      .map((l) => `<li>${esc(l)}</li>`)
      .join("");
  const section = (title: string, type: RecordEntry["type"]) => {
    const list = items(type);
    return list ? `<h2>${title}</h2><ul>${list}</ul>` : "";
  };
  const removed = rec.entries.length - live.length;
  const title = `${carName(rec.car)}: Build Record`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:Helvetica,Arial,sans-serif;color:#111315;margin:36px}
.bar{height:8px;background:#AAFF00;margin:0 0 20px}
header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
.kicker{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#444;margin:0}
h1{font-size:28px;line-height:1.15;margin:4px 0 6px}
.sub{font-size:13px;color:#444;margin:0 0 12px}
.counts{display:flex;gap:20px;margin:0}.counts b{display:block;font-size:26px}.counts span{font-size:11px;color:#444}
figure{margin:0;text-align:center}figcaption{font-size:11px;color:#444;max-width:160px;margin-top:4px}
h2{font-size:14px;letter-spacing:1px;text-transform:uppercase;margin:22px 0 6px;padding-bottom:4px;border-bottom:2px solid #111315}
ul{margin:0;padding-left:18px}li{font-size:12px;margin:5px 0}
.fine{font-size:10px;color:#555;margin-top:18px}
</style></head><body><div class="bar"></div>
<header><div><p class="kicker">For sale · Build Record</p><h1>${esc(carName(rec.car))}</h1>
<p class="sub">${esc([mileage(rec), `${rec.owners} ${rec.owners === 1 ? "owner" : "owners"} on Dynorex`].filter(Boolean).join(" · "))}</p>
<div class="counts"><div><b>${s.entries}</b><span>entries</span></div><div><b>${s.withPaperwork}</b><span>with paperwork</span></div><div><b>${s.shopConfirmed}</b><span>shop-confirmed</span></div></div></div>
${qr && link ? `<figure>${qr}<figcaption>Scan for the full record: dates, paperwork, shop confirmations and every edit</figcaption></figure>` : ""}</header>
${section("Mods", "mod")}${section("Service", "maintenance")}${section("Dyno", "dyno")}
${removed ? `<p class="fine">${removed} removed ${removed === 1 ? "entry is" : "entries are"} shown on the live record.</p>` : ""}
${link ? `<p class="fine">Full record: ${esc(link)}</p>` : ""}<p class="fine">${esc(RECORD_DISCLAIMER)}</p></body></html>`;
}

// ---------------------------------------------------------------- transfer codes and VINs

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function normalizeClaimCode(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}
export const isClaimCode = (s: string) => new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`).test(s);
export const normalizeVin = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isVinShape = (s: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(s));

/** An e-moto's frame number (D-71: letters, digits and hyphens). Compared on letters and digits only. */
export const isFrameShape = (s: string) =>
  /^[A-Z0-9-]{3,40}$/.test(s.trim().toUpperCase()) && normalizeVin(s).length >= 3;
/** What identifies a vehicle to its buyer (D-74): a VIN, or an e-moto's frame number. */
export const identFor = (kind: string | null | undefined) =>
  kind === "ebike"
    ? {
        name: "frame number",
        short: "Frame number",
        where: "Read it off the frame by the steering head.",
        ok: isFrameShape,
      }
    : { name: "VIN", short: "VIN", where: "Read it off the windshield or the door jamb.", ok: isVinShape };
/** Either one: the claim screen doesn't know the vehicle's kind until the code is checked. */
export const isIdentShape = (s: string) => isVinShape(s) || isFrameShape(s);

/**
 * D-74: Bike Index's public search for a frame number, stolen or not. Built from what the buyer typed, never
 * from the record (the record's frame number stays private, like a VIN). Nothing is sent until they tap it.
 */
export const bikeIndexSearchUrl = (frame: string) =>
  `https://bikeindex.org/bikes?serial=${encodeURIComponent(frame.trim().toUpperCase())}&stolenness=all`;
