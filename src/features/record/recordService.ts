import { demoRecordService } from "@/demo/record";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type {
  BuildRecord,
  ClaimStatus,
  ConfirmAnswer,
  ConfirmJob,
  ConfirmLinkStatus,
  MyConfirmRequest,
  ShopConfirmRequest,
  VinCheck,
} from "@/services/supabase/database.types";

/**
 * D-64: the Build Record. A car's finished mods, service log and dyno results as a record a buyer can weigh,
 * shop confirmations, the buyer's link with its VIN check, and handing the record over at a sale.
 * Every rule is enforced by the database (supabase/migrations/20261026000000_build_record.sql).
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type ConfirmEntryType = "mod" | "maintenance";
export type LinkView = (ConfirmJob & { status: ConfirmLinkStatus }) | { status: "not_found" };
export type ShopAnswer = {
  decision: "confirmed" | "declined";
  shopName: string;
  shopCity: string | null;
  odometer: number | null;
  note: string | null;
};

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}
function sb() {
  const c = getSupabase();
  if (!c) throw new Error("not_configured");
  return c;
}
function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
// the D-64 functions are typed in database.types.ts; each call below names the shape it returns
const rpc = async <T>(fn: string, args: Record<string, unknown>) => must(await sb().rpc(fn as never, args as never)) as T;

const realRecordService = {
  /** Your car's record (a car you sold: your read-only copy). */
  myRecord: (vehicleId: string) => run(() => rpc<BuildRecord | null>("my_build_record", { p_vehicle: vehicleId })),
  /** What a buyer's link shows; null when it's off, replaced, expired, or the car was sold. */
  publicRecord: (token: string) => run(() => rpc<BuildRecord | null>("build_record", { p_token: token })),
  checkVin: (token: string, vin: string) => run(() => rpc<VinCheck>("check_record_vin", { p_token: token, p_vin: vin })),

  /** A one-time link for any shop (returns its token), or a request to a Dynorex shop (returns the request id). */
  requestConfirmation: (type: ConfirmEntryType, id: string, businessId: string | null) =>
    run(() => rpc<string>("request_record_confirmation", { p_type: type, p_id: id, p_business: businessId })),
  myConfirmRequests: (vehicleId: string) =>
    run(() => rpc<MyConfirmRequest[]>("my_confirm_requests", { p_vehicle: vehicleId })),
  /** For a shop owner: jobs customers asked you to confirm. */
  shopRequests: () => run(() => rpc<ShopConfirmRequest[]>("shop_confirm_requests", {})),
  answerRequest: (requestId: string, decision: "confirmed" | "declined", odometer: number | null, note: string | null) =>
    run(() =>
      rpc<ConfirmAnswer>("answer_record_confirmation", {
        p_request: requestId,
        p_decision: decision,
        p_odometer: odometer,
        p_note: note,
      }),
    ),
  linkView: (token: string) => run(() => rpc<LinkView>("confirm_link_view", { p_token: token })),
  confirmByLink: (token: string, a: ShopAnswer) =>
    run(() =>
      rpc<ConfirmAnswer>("confirm_by_link", {
        p_token: token,
        p_decision: a.decision,
        p_shop_name: a.shopName,
        p_shop_city: a.shopCity,
        p_odometer: a.odometer,
        p_note: a.note,
      }),
    ),

  /** The code is shown once; the buyer also needs the VIN off the car. */
  startTransfer: (vehicleId: string) => run(() => rpc<string>("start_vehicle_transfer", { p_vehicle: vehicleId })),
  cancelTransfer: (vehicleId: string) =>
    run(async () => {
      await rpc("cancel_vehicle_transfer", { p_vehicle: vehicleId });
    }),
  /** When the open transfer code expires, or null. */
  openTransfer: (vehicleId: string) => run(() => rpc<string | null>("my_vehicle_transfer", { p_vehicle: vehicleId })),
  claimTransfer: (code: string, vin: string) =>
    run(async () => {
      const r = await rpc<{ status: ClaimStatus; vehicle_id?: string }>("claim_vehicle_transfer", { p_code: code, p_vin: vin });
      return { status: r.status, vehicleId: r.vehicle_id ?? null };
    }),
};

export type RecordServiceApi = typeof realRecordService;
export const recordService: RecordServiceApi = config.demoMode ? demoRecordService : realRecordService;

/** The page a shop opens from a one-time link (no account needed). */
export const confirmPath = (token: string) => `/confirm/${token}` as const;
