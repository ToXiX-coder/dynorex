import { SOURCE_LABELS } from "./labels";
import type {
  RecordStatus,
  RecordType,
  ShareField,
  Source,
  Unit,
  Vehicle,
  VehicleRecord,
} from "./types";

export interface PublicRecordView {
  type: RecordType;
  title: string;
  category: string;
  status?: RecordStatus;
  date: string;
  partName?: string;
  brand?: string;
  partNumber?: string;
  mileage?: number;
  cost?: string;
  notes?: string;
  source: Source;
  sourceLabel: string;
}

export interface PublicVehicleView {
  year: number;
  make: string;
  model: string;
  nickname?: string;
  currentMileage?: number;
  mileageUnit: Unit;
  expiresAt: string;
  records: PublicRecordView[];
}

export const formatCost = (cents: number, currency = "USD") =>
  `${(cents / 100).toFixed(2)} ${currency}`;

/**
 * The ONLY place a public page's data is shaped. It builds each object from an allow-list,
 * so VIN, owner ID, email, vehicle ID and attachments can never leak by accident.
 */
export function buildPublicView(
  vehicle: Vehicle,
  records: VehicleRecord[],
  link: { fields: ShareField[]; recordIds: string[]; expiresAt: string },
): PublicVehicleView {
  const has = (f: ShareField) => link.fields.includes(f);
  const chosen = new Set(link.recordIds);
  const shown = records
    .filter((r) => chosen.has(r.id) && r.vehicleId === vehicle.id && r.approval === "approved")
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    nickname: has("nickname") ? vehicle.nickname : undefined,
    currentMileage: has("mileage") ? vehicle.mileage : undefined,
    mileageUnit: vehicle.mileageUnit,
    expiresAt: link.expiresAt,
    records: shown.map((r) => ({
      type: r.type,
      title: r.title,
      category: r.category,
      status: r.status,
      date: r.date,
      partName: r.partName,
      brand: r.brand,
      partNumber: has("partNumbers") ? r.partNumber : undefined,
      mileage: has("mileage") ? r.mileage : undefined,
      cost:
        has("cost") && r.costCents !== undefined ? formatCost(r.costCents, r.currency) : undefined,
      notes: has("notes") ? r.notes : undefined,
      source: r.source,
      sourceLabel: SOURCE_LABELS[r.source].long,
    })),
  };
}
