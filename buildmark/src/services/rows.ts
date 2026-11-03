import type { Confirmation, Entry, Receipt, Revision } from "@/domain/types";

/** Database rows (snake_case) to the app's shapes. Shared by the owner's reads and the buyer's public_record. */

type Row = Record<string, any>;

export const toReceipt = (r: Row): Receipt => ({
  id: r.id,
  kind: r.kind,
  uploadedAt: r.uploaded_at,
  sha256: r.sha256 ?? null,
});

export const toConfirmation = (c: Row | null | undefined): Confirmation | null =>
  c
    ? {
        decision: c.decision,
        shopName: c.shop_name,
        shopCity: c.shop_city ?? null,
        odometer: c.odometer ?? null,
        note: c.note ?? null,
        at: c.at,
        rev: c.rev,
      }
    : null;

export const toRevision = (v: Row): Revision => ({
  rev: v.rev,
  at: v.at ?? v.edited_at,
  reason: v.reason,
  changed: v.changed ?? [],
});

export function toEntry(e: Row, extra?: { receipts?: Row[]; confirmation?: Row | null; revisions?: Row[] }): Entry {
  return {
    id: e.id,
    carId: e.car_id ?? "",
    kind: e.kind,
    category: e.category,
    title: e.title,
    partBrand: e.part_brand ?? null,
    partNumber: e.part_number ?? null,
    carbEo: e.carb_eo ?? null,
    compliance: e.compliance,
    installerType: e.installer_type,
    installerName: e.installer_name ?? null,
    performedOn: e.performed_on,
    odometer: e.odometer ?? null,
    odometerUnit: e.odometer_unit ?? "mi",
    costCents: e.cost_cents ?? null,
    notes: e.notes ?? null,
    dynoWhp: e.dyno_whp ?? null,
    dynoWtq: e.dyno_wtq ?? null,
    rev: e.rev,
    createdAt: e.created_at,
    withdrawnAt: e.withdrawn_at ?? null,
    withdrawReason: e.withdraw_reason ?? null,
    receipts: (extra?.receipts ?? e.receipts ?? []).map(toReceipt),
    confirmation: toConfirmation(extra ? extra.confirmation : e.confirmation),
    revisions: (extra?.revisions ?? e.revisions ?? []).map(toRevision),
  };
}

export const entryColumns = (carId: string, i: import("@/domain/entryForm").EntryInput) => ({
  car_id: carId,
  kind: i.kind,
  category: i.category,
  title: i.title,
  part_brand: i.partBrand,
  part_number: i.partNumber,
  carb_eo: i.carbEo,
  compliance: i.compliance,
  installer_type: i.installerType,
  installer_name: i.installerName,
  performed_on: i.performedOn,
  odometer: i.odometer,
  odometer_unit: i.odometerUnit,
  cost_cents: i.costCents,
  notes: i.notes,
  dyno_whp: i.dynoWhp,
  dyno_wtq: i.dynoWtq,
});
