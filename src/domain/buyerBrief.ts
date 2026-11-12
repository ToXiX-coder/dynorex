import type { BuildRecord, RecordEntry } from "@/services/supabase/database.types";
import { batteryReadingText } from "./maintenance";
import { EMISSIONS_CATEGORIES, evidence, isCarbEo, recordDate, recordSummary } from "./record";

/**
 * D-76: the record, read the way a buyer reads it before paying. `facts` only count what's on the record;
 * `asks` are what it leaves open, worded once for the buyer and once for the seller getting ready. Nothing here
 * judges the vehicle, and a missing receipt is a question to ask, not a mark against the owner.
 */

export type BriefAskId =
  "flagged" | "unconfirmed_shop" | "no_receipt" | "emissions" | "service" | "battery" | "stock_parts";
export interface BriefAsk {
  id: BriefAskId;
  buyer: string;
  seller: string;
}

/** Longer than this since the newest service and a buyer should ask what's been done. */
export const SERVICE_GAP_DAYS = 365;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const isSelf = (s: string | null) => s?.trim().toLowerCase() === "self";

export function buyerBrief(rec: BuildRecord, today: string): { facts: string[]; asks: BriefAsk[] } {
  const live = rec.entries.filter((e) => !e.removed_at && !e.reopened);
  if (!live.length) return { facts: ["Nothing on the record yet."], asks: [] };

  const ebike = rec.car.kind === "ebike";
  const noun = ebike ? "e-moto" : rec.car.kind === "motorcycle" ? "bike" : "car";
  const facts: string[] = [];
  const asks: BriefAsk[] = [];

  const mods = live.filter((e) => e.type === "mod");
  const byShop = mods.filter((e) => e.installed_by?.trim() && !isSelf(e.installed_by));
  const confirmed = byShop.filter((e) => evidence(e).level === 3).length;
  const byOwner = mods.filter((e) => isSelf(e.installed_by)).length;
  const unnamed = mods.length - byShop.length - byOwner;
  const noReceipt = mods.filter((e) => !e.receipts.length).length;

  if (mods.length) {
    const who = [
      byShop.length ? `${byShop.length} by a named shop${confirmed ? ` (${confirmed} shop-confirmed)` : ""}` : null,
      byOwner ? `${byOwner} by the owner` : null,
      unnamed ? `${unnamed} ${unnamed === 1 ? "doesn't" : "don't"} say who` : null,
    ].filter(Boolean);
    facts.push(`${plural(mods.length, "finished mod")}: ${who.join(", ")}.`);
    const kept = mods.length - noReceipt;
    facts.push(`${kept} of ${plural(mods.length, "mod")} ${kept === 1 ? "has" : "have"} a receipt on file.`);
  }

  const services = live.filter((e) => e.type === "maintenance").sort((a, b) => b.date.localeCompare(a.date));
  const newest = services[0];
  if (newest) {
    const at = newest.odometer != null ? ` at ${newest.odometer.toLocaleString("en-US")} ${rec.odometer_unit}` : "";
    facts.push(
      `${plural(services.length, "service")} logged, newest: ${newest.title} on ${recordDate(newest.date)}${at}.`,
    );
  } else facts.push("No service logged.");

  // e-motos have no tailpipe, so the emissions question doesn't apply to them
  const emissions = ebike
    ? []
    : mods.filter(
        (e: RecordEntry) =>
          e.category && EMISSIONS_CATEGORIES.includes(e.category) && e.compliance !== "not_emissions_related",
      );
  const withEo = emissions.filter((e) => e.carb_eo && isCarbEo(e.carb_eo)).length;
  const stock = emissions.filter((e) => e.compliance === "stock" && !e.carb_eo).length;
  const offRoad = emissions.filter((e) => e.compliance === "off_road_only").length;
  const noStatus = emissions.length - withEo - stock - offRoad;
  if (emissions.length) {
    const split = [
      withEo ? `${withEo} with a CARB EO number` : null,
      stock ? `${stock} back to the factory part` : null,
      offRoad ? `${offRoad} marked off-road only` : null,
      noStatus ? `${noStatus} with no status` : null,
    ].filter(Boolean);
    facts.push(`${plural(emissions.length, "emissions-related part")}: ${split.join(", ")}.`);
  }

  const battery = ebike ? services.find((e) => batteryReadingText(e)) : undefined;
  if (battery)
    facts.push(`Battery check ${recordDate(battery.date)}: ${batteryReadingText(battery)} (owner's reading).`);

  const flagged = recordSummary(rec.entries).flagged;
  if (flagged)
    asks.push({
      id: "flagged",
      buyer: `${plural(flagged, "entry carries", "entries carry")} a note below. Read each one and ask what happened.`,
      seller: `${plural(flagged, "entry carries", "entries carry")} a note the buyer will see. Be ready to explain each one.`,
    });
  const open = byShop.length - confirmed;
  if (open)
    asks.push({
      id: "unconfirmed_shop",
      buyer: `${plural(open, "mod names", "mods name")} a shop that hasn't confirmed the work. Ask to see the shop's invoice.`,
      seller: `${plural(open, "mod names", "mods name")} a shop that hasn't confirmed the work. Send the shop a link, or have the invoice ready.`,
    });
  // a shop's own confirmation stands in for the receipt, so those mods aren't a question
  const bare = mods.filter((e) => !e.receipts.length && evidence(e).level < 3).length;
  if (bare)
    asks.push({
      id: "no_receipt",
      buyer: `${plural(bare, "mod has", "mods have")} no receipt on file. Ask to see the receipts.`,
      seller: `${plural(bare, "mod has", "mods have")} no receipt on file. Add the ones you still have.`,
    });
  const noEo = offRoad + noStatus;
  if (noEo)
    asks.push({
      id: "emissions",
      buyer: `${plural(noEo, "emissions-related part has", "emissions-related parts have")} no CARB EO number. Ask how the ${noun} passes inspection where you live.`,
      seller: `${plural(noEo, "emissions-related part has", "emissions-related parts have")} no CARB EO number. Add the number if the part has one; buyers ask how the ${noun} passes inspection.`,
    });
  const gap = newest
    ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${newest.date}T00:00:00Z`)) / 86_400_000)
    : null;
  if (gap === null)
    asks.push({
      id: "service",
      buyer: "No service on the record. Ask for the service history.",
      seller: "No service on the record. Log the latest one; buyers ask for service history first.",
    });
  else if (gap > SERVICE_GAP_DAYS)
    asks.push({
      id: "service",
      buyer: `No service logged since ${recordDate(newest!.date)}. Ask what's been done since.`,
      seller: `No service logged since ${recordDate(newest!.date)}. Log what's been done since.`,
    });
  if (ebike && !battery)
    asks.push({
      id: "battery",
      buyer: "No battery check on the record. Ask for a photo of the display at full charge.",
      seller: "No battery check on the record. Log one with the charge cycles and the volts at full charge.",
    });
  if (mods.length)
    asks.push({
      id: "stock_parts",
      buyer: `Ask whether the stock parts come with the ${noun}.`,
      seller: `Buyers ask about stock parts. Say in your listing whether they come with the ${noun}.`,
    });

  return { facts, asks };
}
