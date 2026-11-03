import { z } from "zod";
import { CURRENCIES, parseMoney, type Currency } from "../money";
import { complianceChoices, isCarbEo, normalizeCarbEo } from "../record";
import { DELTA_LIMITS, SPEC_UNITS, type SpecDeltas, type SpecField } from "../specs";

export { fieldErrors } from "./account";

/**
 * Vehicle and mod form rules. Same limits as the database CHECK constraints; the database is the
 * authority, this gives instant feedback and keeps the user's input on recoverable errors.
 */

export const MOD_CATEGORIES = [
  { id: "engine", label: "Engine" },
  { id: "suspension", label: "Suspension" },
  { id: "exhaust", label: "Exhaust" },
  { id: "aero", label: "Aero" },
  { id: "interior", label: "Interior" },
  { id: "wheels", label: "Wheels" },
  { id: "exterior", label: "Exterior" },
  { id: "electronics", label: "Electronics" },
  { id: "safety", label: "Safety" },
  // D-71: two-wheel categories (each vehicle kind offers its own set, see domain/vehicleKind.ts)
  { id: "brakes", label: "Brakes" },
  { id: "controls", label: "Controls" },
  { id: "luggage", label: "Luggage" },
  { id: "motor", label: "Motor" },
  { id: "battery", label: "Battery" },
  { id: "drivetrain", label: "Drivetrain" },
  { id: "cockpit", label: "Cockpit" },
] as const;
export type ModCategoryId = (typeof MOD_CATEGORIES)[number]["id"];

export const MOD_STATUSES = [
  { id: "planned", label: "Planned", mark: "○" },
  { id: "in_progress", label: "In Progress", mark: "◑" },
  { id: "complete", label: "Complete", mark: "●" },
] as const;
export type ModStatusId = (typeof MOD_STATUSES)[number]["id"];

const MAX_YEAR = () => new Date().getFullYear() + 2;

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v),
    z.string().max(max, `${label}: ${max} characters max`).nullable(),
  );
const optNumber = (label: string, min: number, max: number, opts: { int?: boolean; exclusive?: boolean } = {}) =>
  z.preprocess(
    (v) => {
      const b = blankToNull(v);
      return b === null || b === undefined ? null : Number(String(b).replace(",", "."));
    },
    z
      .number({ error: `${label} must be a number` })
      .refine((n) => !Number.isNaN(n), `${label} must be a number`)
      .refine((n) => (opts.int ? Number.isInteger(n) : true), `${label}: whole numbers only`)
      .refine((n) => (opts.exclusive ? n > min && n < max : n >= min && n <= max), `${label}: ${min}–${max}`)
      .nullable(),
  );

export const vehicleFormSchema = z.object({
  year: z.preprocess(
    (v) => Number(v),
    z
      .number({ error: "Enter the year" })
      .int("Enter a 4-digit year")
      .refine((y) => y >= 1886 && y <= MAX_YEAR(), `Year: 1886–${MAX_YEAR()}`),
  ),
  make: z.string().trim().min(1, "Enter the make").max(50, "Make: 50 characters max"),
  model: z.string().trim().min(1, "Enter the model").max(50, "Model: 50 characters max"),
  trim_level: optText(50, "Trim"),
  nickname: optText(60, "Build name"),
  vin: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().toUpperCase()) : v),
    z
      .string()
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "A VIN is 17 letters and numbers, without I, O or Q")
      .nullable(),
  ),
  odometer: optNumber("Odometer", 0, 2_000_000, { int: true }),
  odometer_unit: z.enum(["mi", "km"]),
  description: optText(2000, "Notes"),
  baseline_hp: optNumber("Horsepower", 0, 5000, { exclusive: true }),
  baseline_torque_lbft: optNumber("Torque", 0, 5000, { exclusive: true }),
  // an e-bike can weigh as little as 10 lb; the 100 lb floor for everything else is checked below (D-71)
  baseline_weight_lb: optNumber("Weight", 10, 20000, { exclusive: true }),
  baseline_zero_to_sixty_s: optNumber("0–60", 0, 60, { exclusive: true }),
  visibility: z.enum(["private", "public"]),
  // D-71: what it is (cars when left out, as every vehicle was before), plus the e-bike's own stock numbers
  kind: z.enum(["car", "motorcycle", "ebike"]).default("car"),
  motor_w: optNumber("Motor power", 1, 20000, { int: true }).optional(),
  battery_wh: optNumber("Battery", 1, 10000, { int: true }).optional(),
  range_mi: optNumber("Range", 0, 500, { exclusive: true }).optional(),
  top_speed_mph: optNumber("Top speed", 0, 300, { exclusive: true }).optional(),
}).superRefine((v, ctx) => {
  if (v.kind !== "ebike" && v.baseline_weight_lb !== null && v.baseline_weight_lb <= 100)
    ctx.addIssue({ code: "custom", path: ["baseline_weight_lb"], message: "Weight: 100–20000" });
});
export type VehicleForm = z.infer<typeof vehicleFormSchema>;

/**
 * The form as saved: an e-bike has no VIN or 0-60, and anything else carries no e-bike numbers (the database
 * checks the same), so switching the type in the form never leaves the other type's fields behind.
 */
export function vehicleForKind(f: VehicleForm): VehicleForm {
  if (f.kind === "ebike")
    return { ...f, vin: null, baseline_hp: null, baseline_torque_lbft: null, baseline_zero_to_sixty_s: null };
  return { ...f, motor_w: null, battery_wh: null, range_mi: null, top_speed_mph: null };
}

/** Raw text fields for the four spec deltas in the mod form. */
export type DeltaInputs = Partial<Record<SpecField, { delta: string; unit: string }>>;

export function buildSpecDeltas(
  input: DeltaInputs,
): { ok: true; value: SpecDeltas } | { ok: false; errors: Record<string, string> } {
  const value: SpecDeltas = { schema_version: 1 };
  const errors: Record<string, string> = {};
  for (const field of Object.keys(SPEC_UNITS) as SpecField[]) {
    const raw = input[field];
    if (!raw || raw.delta.trim() === "") continue;
    const n = Number(raw.delta.replace(",", "."));
    const units = SPEC_UNITS[field] as readonly string[];
    if (!Number.isFinite(n)) errors[field] = "Enter a number, like 15 or -20";
    else if (Math.abs(n) > DELTA_LIMITS[field]) errors[field] = `Keep it within ±${DELTA_LIMITS[field]}`;
    else if (!units.includes(raw.unit)) errors[field] = "Pick a unit";
    else (value as Record<string, unknown>)[field] = { delta: n, unit: raw.unit };
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export const modFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name the mod").max(120, "Name: 120 characters max"),
    category: z.enum(MOD_CATEGORIES.map((c) => c.id) as [ModCategoryId, ...ModCategoryId[]], {
      error: "Pick a category",
    }),
    brand: optText(80, "Brand"),
    part_number: optText(80, "Part number"),
    // D-62: who fitted it (a shop or "Self"), for the insurance list
    installed_by: optText(80, "Fitted by").optional(),
    // D-68: the car's mileage when it was fitted ("61,200" is fine), same range as the database check
    installed_odometer: z
      .preprocess(
        (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v),
        optNumber("Mileage", 0, 2_000_000, { int: true }),
      )
      .optional(),
    // D-64: emissions status for engine / exhaust / electronics parts, and a CARB EO number when it has one
    compliance: z.preprocess(
      blankToNull,
      z.enum(["not_emissions_related", "carb_eo", "off_road_only", "stock", "unknown"]).nullable(),
    ).optional(),
    carb_eo: optText(20, "CARB EO number").optional(),
    cost: z.string(),
    currency: z.enum(CURRENCIES),
    status: z.enum(["planned", "in_progress", "complete"], { error: "Pick a status" }),
    notes: optText(4000, "Notes"),
    installed_on: z.preprocess(
      blankToNull,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
        .refine((s) => !Number.isNaN(Date.parse(s)) && s >= "1900-01-01" && s <= "2100-12-31", "Not a real date")
        .nullable(),
    ),
  })
  .transform((v, ctx) => {
    const minor = parseMoney(v.cost, v.currency as Currency);
    if (Number.isNaN(minor)) {
      ctx.addIssue({ code: "custom", path: ["cost"], message: "Enter an amount like 249.99" });
      return z.NEVER;
    }
    // the status only applies to parts that can touch emissions; "not emissions-related" only to electronics
    const choices = complianceChoices(v.category);
    const compliance = v.compliance && choices.includes(v.compliance) ? v.compliance : null;
    const eo = v.carb_eo ? normalizeCarbEo(v.carb_eo) : null;
    if (compliance === "carb_eo" && !(eo && isCarbEo(eo))) {
      ctx.addIssue({ code: "custom", path: ["carb_eo"], message: "CARB EO numbers look like D-142-44" });
      return z.NEVER;
    }
    const { cost: _cost, ...rest } = v;
    return {
      ...rest,
      compliance,
      carb_eo: compliance === "carb_eo" ? eo : null,
      cost_minor: minor,
      currency: minor === null ? null : v.currency,
    };
  });
export type ModForm = z.infer<typeof modFormSchema>;
