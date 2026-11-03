import { categoryLabel, COMPLIANCE_LABELS, isEmissionsCategory } from "./compliance";
import { evidence, formatDate, summary } from "./evidence";
import { backwardsEntries, formatMiles, toMiles } from "./odometer";
import type { Entry, PublicRecord } from "./types";

/**
 * The listing export: plain text a seller pastes into an auction listing or classified ad, and an HTML version
 * for a PDF. Both carry the link to the live record so a buyer can see receipts dates, shop confirmations and edits.
 */

export const DISCLAIMER =
  "Records are written by the car's owners. Where marked, the shop named confirmed the work through a link sent to it. Buildmark doesn't inspect cars or check records.";

const KIND_WORD: Record<Entry["kind"], string> = {
  install: "Installed",
  removal: "Removed",
  return_to_stock: "Returned to stock",
  service: "Service",
  dyno: "Dyno",
};

export const carTitle = (c: PublicRecord["car"]) => [c.year, c.make, c.model, c.trim].filter(Boolean).join(" ");

function line(e: Entry, backwards: Set<string>): string {
  const ev = evidence(e);
  const bits = [formatDate(e.performedOn)];
  if (e.odometer != null) bits.push(formatMiles(toMiles(e.odometer, e.odometerUnit)));
  const part = [e.partBrand, e.title].filter(Boolean).join(" ");
  bits.push(`${KIND_WORD[e.kind]}: ${part} (${categoryLabel(e.category)})`);
  if (e.kind === "dyno" && (e.dynoWhp || e.dynoWtq)) {
    bits.push([e.dynoWhp && `${e.dynoWhp} whp`, e.dynoWtq && `${e.dynoWtq} wtq`].filter(Boolean).join(" / ") + ", owner-reported");
  }
  bits.push(e.installerType === "shop" ? `by ${e.installerName ?? "a shop"}` : "by owner");
  if (isEmissionsCategory(e.category)) bits.push(e.carbEo ? `CARB EO ${e.carbEo}` : COMPLIANCE_LABELS[e.compliance]);
  const marks: string[] = [];
  if (e.receipts.some((r) => r.kind === "receipt")) marks.push("receipt");
  if (e.receipts.some((r) => r.kind === "dyno_sheet")) marks.push("dyno sheet");
  if (ev.level === 3) marks.push("shop-confirmed");
  for (const f of ev.flags) marks.push(f.text.toLowerCase());
  if (backwards.has(e.id)) marks.push("odometer lower than an earlier entry");
  return `- ${bits.join(" · ")}${marks.length ? ` [${marks.join("; ")}]` : ""}`;
}

export function buildSheetText(rec: PublicRecord, link: string | null): string {
  const live = rec.entries.filter((e) => !e.withdrawnAt).sort((a, b) => a.performedOn.localeCompare(b.performedOn));
  const s = summary(rec.entries);
  const back = backwardsEntries(rec.entries);
  const out = [
    `${carTitle(rec.car)}: build record`,
    `${s.entries} entries · ${s.withReceipts} with receipts · ${s.shopConfirmed} shop-confirmed · ${rec.owners} ${rec.owners === 1 ? "owner" : "owners"} on Buildmark`,
    "",
    ...live.map((e) => line(e, back)),
  ];
  const withdrawn = rec.entries.filter((e) => e.withdrawnAt).length;
  if (withdrawn) out.push("", `${withdrawn} withdrawn ${withdrawn === 1 ? "entry is" : "entries are"} shown on the live record.`);
  if (link) out.push("", `Full record, with dates, receipts and edit history: ${link}`);
  out.push("", DISCLAIMER);
  return out.join("\n");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function buildSheetHtml(rec: PublicRecord, link: string | null): string {
  const [title, counts, , ...rest] = buildSheetText(rec, link).split("\n");
  const items = rest.filter((l) => l.startsWith("- ")).map((l) => `<li>${esc(l.slice(2))}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title!)}</title>
<style>body{font-family:Georgia,serif;color:#1C2430;margin:40px}h1{font-size:22px}p{font-size:12px;color:#4A5361}li{font-size:12px;margin:6px 0}</style>
</head><body><h1>${esc(title!)}</h1><p>${esc(counts!)}</p><ul>${items}</ul>${link ? `<p>Full record: ${esc(link)}</p>` : ""}<p>${esc(DISCLAIMER)}</p></body></html>`;
}
