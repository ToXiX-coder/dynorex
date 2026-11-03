import type { Category, Compliance, Entry } from "./types";

/**
 * Emissions rules (research/reports, "The real risks"): a shop confirming emissions-relevant work creates a dated
 * admission against itself, and CARB holds installers liable. So Buildmark never asks a shop to confirm an
 * emissions-relevant part unless it carries a CARB Executive Order number. Returning a car to stock is always
 * confirmable: it is the lawful path regulators point to.
 */

export const CATEGORIES: { id: Category; label: string; emissions: boolean }[] = [
  { id: "tune", label: "Tune / ECU", emissions: true },
  { id: "intake", label: "Intake", emissions: true },
  { id: "exhaust", label: "Exhaust", emissions: true },
  { id: "forced_induction", label: "Turbo / supercharger", emissions: true },
  { id: "fuel", label: "Fuel system", emissions: true },
  { id: "engine_internal", label: "Engine internals", emissions: true },
  { id: "suspension", label: "Suspension", emissions: false },
  { id: "wheels_tires", label: "Wheels and tires", emissions: false },
  { id: "brakes", label: "Brakes", emissions: false },
  { id: "drivetrain", label: "Drivetrain", emissions: false },
  { id: "aero_body", label: "Aero and body", emissions: false },
  { id: "interior", label: "Interior", emissions: false },
  { id: "lighting", label: "Lighting", emissions: false },
  { id: "electrical", label: "Electrical", emissions: false },
  { id: "other", label: "Other", emissions: false },
];

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? "Other";
export const isEmissionsCategory = (c: Category) => CATEGORIES.find((x) => x.id === c)?.emissions ?? false;

export const COMPLIANCE_LABELS: Record<Compliance, string> = {
  not_emissions_related: "Not emissions-related",
  carb_eo: "CARB EO",
  off_road_only: "Off-road use only",
  unknown: "Emissions status not recorded",
};

/** The choices offered for a category. Non-emissions parts have only one answer. */
export function complianceChoices(c: Category): Compliance[] {
  return isEmissionsCategory(c) ? ["carb_eo", "off_road_only", "unknown"] : ["not_emissions_related"];
}

export const defaultCompliance = (c: Category): Compliance =>
  isEmissionsCategory(c) ? "unknown" : "not_emissions_related";

/** CARB Executive Order numbers look like D-142-44 or D-569-1. */
export const normalizeCarbEo = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
export const isCarbEo = (s: string) => /^D-\d{1,4}-\d{1,3}$/.test(normalizeCarbEo(s));

export type ConfirmBlock = "withdrawn" | "not_shop" | "emissions" | "already_confirmed" | null;

/** Why a shop confirmation can't be requested for this entry, or null when it can. */
export function confirmBlock(
  e: Pick<Entry, "kind" | "category" | "compliance" | "carbEo" | "installerType" | "withdrawnAt" | "confirmation" | "rev">,
): ConfirmBlock {
  if (e.withdrawnAt) return "withdrawn";
  if (e.installerType !== "shop") return "not_shop";
  if (e.confirmation?.decision === "confirmed" && e.confirmation.rev === e.rev) return "already_confirmed";
  if (e.kind === "return_to_stock") return null;
  if (!isEmissionsCategory(e.category)) return null;
  if (e.compliance === "carb_eo" && e.carbEo && isCarbEo(e.carbEo)) return null;
  return "emissions";
}

export const CONFIRM_BLOCK_COPY: Record<Exclude<ConfirmBlock, null>, string> = {
  withdrawn: "This entry was withdrawn.",
  not_shop: "Only work a shop did can be confirmed by a shop.",
  emissions:
    "Shops aren't asked to confirm emissions-related parts without a CARB EO number. Add the EO number if the part has one.",
  already_confirmed: "The shop has already confirmed this version of the entry.",
};
