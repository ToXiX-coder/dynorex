import type { EntryInput } from "@/domain/entryForm";
import type { Car, Entry, PublicRecord } from "@/domain/types";

/**
 * Everything the screens can ask for. Two implementations: Supabase (src/services/supabaseApi.ts) and the
 * sample-data twin for demos (src/services/demoApi.ts), which follows the same rules.
 * Failures throw ApiError with a code the screens turn into words (src/services/errors.ts).
 */
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export type VinCheck = "match" | "no_match" | "no_vin_on_record" | "too_many" | "not_found";
export type ClaimStatus = "ok" | "code_invalid" | "vin_mismatch" | "own_car" | "rate_limited";
export type ShopLinkStatus = "open" | "closed" | "expired" | "changed" | "not_found";
export type ConfirmResult = "ok" | "closed" | "expired" | "changed" | "not_found" | "not_allowed";

export interface ShopView {
  status: ShopLinkStatus;
  car?: PublicRecord["car"];
  entry?: Pick<
    Entry,
    "kind" | "category" | "title" | "partBrand" | "partNumber" | "carbEo" | "installerName" | "performedOn" | "odometer" | "odometerUnit"
  >;
}

export interface NewCar {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  vin: string | null;
}

export interface PickedFile {
  uri: string;
  mimeType: string;
  name: string;
}

export interface Api {
  myCars(): Promise<Car[]>;
  addCar(input: NewCar): Promise<string>;
  setVin(carId: string, vin: string): Promise<void>;
  deleteCar(carId: string): Promise<void>;
  entries(carId: string): Promise<Entry[]>;
  addEntry(carId: string, input: EntryInput): Promise<string>;
  reviseEntry(entryId: string, patch: Record<string, unknown>, reason: string): Promise<void>;
  withdrawEntry(entryId: string, reason: string): Promise<void>;
  addReceipt(entryId: string, kind: "receipt" | "dyno_sheet", file: PickedFile): Promise<void>;
  removeReceipt(receiptId: string): Promise<void>;
  requestConfirmation(entryId: string): Promise<string>;
  myConfirmLink(entryId: string): Promise<string | null>;
  shopView(token: string): Promise<ShopView>;
  confirmInstall(
    token: string,
    input: { decision: "confirmed" | "declined"; shopName: string; shopCity: string | null; odometer: number | null; note: string | null },
  ): Promise<ConfirmResult>;
  myShareLink(carId: string): Promise<string | null>;
  createShareLink(carId: string): Promise<string>;
  revokeShareLink(carId: string): Promise<void>;
  publicRecord(token: string): Promise<PublicRecord | null>;
  checkVin(token: string, vin: string): Promise<VinCheck>;
  startTransfer(carId: string): Promise<string>;
  cancelTransfer(carId: string): Promise<void>;
  openTransfer(carId: string): Promise<string | null>;
  claimTransfer(code: string, vin: string): Promise<{ status: ClaimStatus; carId?: string }>;
}
