import { z } from "zod";
import { isCarbEo, isEmissionsCategory, normalizeCarbEo } from "./compliance";
import type { Category, Compliance, EntryKind, InstallerType, OdometerUnit } from "./types";

/** What the add/edit form produces. The database re-checks every rule. */
export interface EntryInput {
  kind: EntryKind;
  category: Category;
  title: string;
  partBrand: string | null;
  partNumber: string | null;
  carbEo: string | null;
  compliance: Compliance;
  installerType: InstallerType;
  installerName: string | null;
  performedOn: string;
  odometer: number | null;
  odometerUnit: OdometerUnit;
  costCents: number | null;
  notes: string | null;
  dynoWhp: number | null;
  dynoWtq: number | null;
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .transform((s) => (s === "" ? null : s));
const optInt = (max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(/[,\s]/g, ""))
    .refine((s) => s === "" || (/^\d+$/.test(s) && Number(s) <= max), `${label} should be a whole number`)
    .transform((s) => (s === "" ? null : Number(s)));

export const entryFormSchema = z
  .object({
    kind: z.enum(["install", "removal", "return_to_stock", "service", "dyno"]),
    category: z.enum([
      "tune", "intake", "exhaust", "forced_induction", "fuel", "engine_internal", "suspension", "wheels_tires",
      "brakes", "drivetrain", "aero_body", "interior", "lighting", "electrical", "other",
    ]),
    title: z.string().trim().min(1, "Say what was done").max(80, "Keep it under 80 characters"),
    partBrand: opt(40),
    partNumber: opt(40),
    carbEo: opt(20),
    compliance: z.enum(["not_emissions_related", "carb_eo", "off_road_only", "unknown"]),
    installerType: z.enum(["owner", "shop"]),
    installerName: opt(80),
    performedOn: z
      .string()
      .trim()
      .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Use YYYY-MM-DD")
      .refine((s) => Date.parse(`${s}T00:00:00Z`) <= Date.now() + 86_400_000, "That date is in the future"),
    odometer: optInt(2_000_000, "Mileage"),
    odometerUnit: z.enum(["mi", "km"]),
    cost: z
      .string()
      .trim()
      .transform((s) => s.replace(/[$,\s]/g, ""))
      .refine((s) => s === "" || /^\d+(\.\d{1,2})?$/.test(s), "Cost should look like 1250 or 1250.50")
      .transform((s) => (s === "" ? null : Math.round(Number(s) * 100))),
    notes: opt(1000),
    dynoWhp: optInt(3000, "Horsepower"),
    dynoWtq: optInt(3000, "Torque"),
  })
  .superRefine((v, ctx) => {
    if (v.installerType === "shop" && (!v.installerName || v.installerName.length < 2)) {
      ctx.addIssue({ code: "custom", path: ["installerName"], message: "Name the shop" });
    }
    if (isEmissionsCategory(v.category) === (v.compliance === "not_emissions_related")) {
      ctx.addIssue({ code: "custom", path: ["compliance"], message: "Pick the emissions status" });
    }
    if (v.compliance === "carb_eo" && !(v.carbEo && isCarbEo(v.carbEo))) {
      ctx.addIssue({ code: "custom", path: ["carbEo"], message: "CARB EO numbers look like D-142-44" });
    }
    if (v.kind === "dyno" && v.dynoWhp == null && v.dynoWtq == null) {
      ctx.addIssue({ code: "custom", path: ["dynoWhp"], message: "Add horsepower or torque" });
    }
  })
  .transform(
    ({ cost, ...v }): EntryInput => ({
      ...v,
      carbEo: v.compliance === "carb_eo" && v.carbEo ? normalizeCarbEo(v.carbEo) : null,
      installerName: v.installerType === "shop" ? v.installerName : null,
      costCents: cost,
      dynoWhp: v.kind === "dyno" ? v.dynoWhp : null,
      dynoWtq: v.kind === "dyno" ? v.dynoWtq : null,
    }),
  );

export type EntryFormValues = z.input<typeof entryFormSchema>;

export const KIND_LABELS: Record<EntryKind, string> = {
  install: "Installed a part",
  removal: "Removed a part",
  return_to_stock: "Returned to stock",
  service: "Service",
  dyno: "Dyno run",
};

/** The fields that differ between the saved entry and the form, as revise_entry's patch (snake_case keys). */
export function patchFrom(before: EntryInput, after: EntryInput): Record<string, unknown> {
  const keys: [keyof EntryInput, string][] = [
    ["category", "category"], ["title", "title"], ["partBrand", "part_brand"], ["partNumber", "part_number"],
    ["carbEo", "carb_eo"], ["compliance", "compliance"], ["installerType", "installer_type"],
    ["installerName", "installer_name"], ["performedOn", "performed_on"], ["odometer", "odometer"],
    ["odometerUnit", "odometer_unit"], ["costCents", "cost_cents"], ["notes", "notes"], ["dynoWhp", "dyno_whp"],
    ["dynoWtq", "dyno_wtq"],
  ];
  const patch: Record<string, unknown> = {};
  for (const [k, col] of keys) if (before[k] !== after[k]) patch[col] = after[k];
  return patch;
}
