/** The record's shapes, as the app sees them. The database is the source of truth (supabase/migrations). */

export type EntryKind = "install" | "removal" | "return_to_stock" | "service" | "dyno";
export type Category =
  | "tune"
  | "intake"
  | "exhaust"
  | "forced_induction"
  | "fuel"
  | "engine_internal"
  | "suspension"
  | "wheels_tires"
  | "brakes"
  | "drivetrain"
  | "aero_body"
  | "interior"
  | "lighting"
  | "electrical"
  | "other";
export type Compliance = "not_emissions_related" | "carb_eo" | "off_road_only" | "unknown";
export type InstallerType = "owner" | "shop";
export type OdometerUnit = "mi" | "km";

export interface Car {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  nickname: string | null;
  /** Owner's own view only. Never on a shared record. */
  vin: string | null;
  /** True when the signed-in person is a former owner keeping a read-only copy. */
  archived: boolean;
}

export interface Receipt {
  id: string;
  kind: "receipt" | "dyno_sheet";
  /** Server time of upload: the owner can't backdate it. */
  uploadedAt: string;
  /** SHA-256 of the file as uploaded, so a later swap would show. */
  sha256: string | null;
}

export interface Confirmation {
  decision: "confirmed" | "declined";
  /** As typed by the person who opened the shop link. Buildmark doesn't check who they are. */
  shopName: string;
  shopCity: string | null;
  odometer: number | null;
  note: string | null;
  at: string;
  /** The entry revision the shop saw. A later edit means the shop hasn't seen the current text. */
  rev: number;
}

export interface Revision {
  rev: number;
  at: string;
  reason: string;
  changed: string[];
}

export interface Entry {
  id: string;
  carId: string;
  kind: EntryKind;
  category: Category;
  title: string;
  partBrand: string | null;
  partNumber: string | null;
  carbEo: string | null;
  compliance: Compliance;
  installerType: InstallerType;
  installerName: string | null;
  /** YYYY-MM-DD, when the work was done. */
  performedOn: string;
  odometer: number | null;
  odometerUnit: OdometerUnit;
  costCents: number | null;
  notes: string | null;
  dynoWhp: number | null;
  dynoWtq: number | null;
  rev: number;
  /** When it was logged (server time). */
  createdAt: string;
  withdrawnAt: string | null;
  withdrawReason: string | null;
  receipts: Receipt[];
  confirmation: Confirmation | null;
  revisions: Revision[];
}

/** What a buyer sees through a shared link: no VIN, costs or private notes. */
export interface PublicRecord {
  car: Pick<Car, "year" | "make" | "model" | "trim">;
  ownerSince: string;
  owners: number;
  entries: Entry[];
}
