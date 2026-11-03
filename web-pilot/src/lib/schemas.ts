import { z } from "zod";
import {
  CURRENCIES,
  MOD_STATUSES,
  OWNER_SOURCES,
  RECORD_TYPES,
  SHARE_FIELDS,
  UNITS,
} from "./types";

const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optText = (max: number) => z.preprocess(blankToUndef, z.string().trim().max(max).optional());
const reqText = (max: number) => z.string().trim().min(1, "Required").max(max);
const optInt = (min: number, max: number) =>
  z.preprocess(blankToUndef, z.coerce.number().int().min(min).max(max).optional());

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-03-14")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return (
      !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === s &&
      s >= "1900-01-01" &&
      s <= "2100-12-31"
    );
  }, "Not a real date");

const vin = z.preprocess(
  (v) => {
    const b = blankToUndef(v);
    return typeof b === "string" ? b.trim().toUpperCase() : b;
  },
  z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "A VIN is 17 letters and numbers (no I, O or Q)")
    .optional(),
);

export const vehicleSchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(1886)
    .max(new Date().getFullYear() + 2),
  make: reqText(50),
  model: reqText(50),
  nickname: optText(60),
  vin,
  mileage: optInt(0, 5_000_000),
  mileageUnit: z.enum(UNITS).default("mi"),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

const costField = z.preprocess(blankToUndef, z.coerce.number().min(0).max(10_000_000).optional());

const recordBase = z.object({
  type: z.enum(RECORD_TYPES),
  title: reqText(120),
  category: reqText(60),
  partName: optText(120),
  brand: optText(80),
  partNumber: optText(80),
  status: z.preprocess(blankToUndef, z.enum([...MOD_STATUSES, "completed"]).optional()),
  date: isoDate,
  mileage: optInt(0, 5_000_000),
  cost: costField,
  currency: z.preprocess(blankToUndef, z.enum(CURRENCIES).optional()),
  notes: optText(2000),
  source: z.enum(OWNER_SOURCES).default("owner_entered"),
});

/** Statuses must fit the record type: mods use the mod list, service is completed, setup has none. */
function normalizeStatus<T extends { type: string; status?: string }>(v: T, ctx: z.RefinementCtx) {
  if (v.type === "modification") {
    if (!v.status || v.status === "completed") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Pick a status for a modification",
      });
    }
  } else if (v.type === "service") {
    if (v.status && v.status !== "completed") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Service records can only be completed",
      });
    }
  } else if (v.status) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Setup notes have no status" });
  }
}

export const recordSchema = recordBase.superRefine(normalizeStatus).transform((v) => ({
  ...v,
  status: v.type === "service" ? ("completed" as const) : v.status,
  currency: v.cost === undefined ? undefined : (v.currency ?? "USD"),
}));
export type RecordInput = z.infer<typeof recordSchema>;

/** What a shop can send through a request link. No attachments, no cost, no source choice. */
export const submissionSchema = z
  .object({
    type: z.enum(["modification", "service"]),
    title: reqText(120),
    category: reqText(60),
    partName: optText(120),
    brand: optText(80),
    partNumber: optText(80),
    status: z.preprocess(blankToUndef, z.enum([...MOD_STATUSES, "completed"]).optional()),
    date: isoDate,
    notes: optText(1000),
    submitterLabel: optText(80),
  })
  .superRefine(normalizeStatus)
  .transform((v) => ({ ...v, status: v.type === "service" ? ("completed" as const) : v.status }));
export type SubmissionInput = z.infer<typeof submissionSchema>;

export const shareLinkSchema = z.object({
  fields: z.array(z.enum(SHARE_FIELDS)).default([]),
  recordIds: z.array(z.string().uuid()).max(500),
  days: z.coerce
    .number()
    .int()
    .refine((n) => [1, 7, 30, 90].includes(n), "Pick 1, 7, 30 or 90 days"),
});
export type ShareLinkInput = z.infer<typeof shareLinkSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export const PILOT_CONSENT_TEXT =
  "I agree that Dynorex may store these details and contact me about a possible pilot. This is not a contract or a partnership. I can ask for my details to be deleted at any time.";

export const pilotSchema = z.object({
  shopName: reqText(120),
  contactName: reqText(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  region: reqText(80),
  workType: reqText(300),
  consent: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.literal(true, { error: "Please tick the box to agree" }),
  ),
});
export type PilotInput = z.infer<typeof pilotSchema>;
