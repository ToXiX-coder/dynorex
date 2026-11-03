import { demoRecordsService } from "@/demo/upgrades";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { ReceiptRow } from "@/services/supabase/database.types";

/**
 * Receipts and the buyer's link (D-61). Receipts are private photos on a mod or a maintenance record; they are
 * uploaded through the photo pipeline (register-photo writes the row) and only their owner ever sees them. The
 * link shows a buyer the car's Build Record (D-64, src/features/record): never the VIN, costs, notes or who owns it.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };

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

export type ReceiptFor = { modId: string } | { maintenanceId: string };

const realRecordsService = {
  receipts: (vehicleId: string) =>
    run(
      async () =>
        must(
          await sb().from("receipts").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
        ) as ReceiptRow[],
    ),
  removeReceipt: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_receipt", { p_id: id }));
    }),
  /** The live link for this car, if any (owner only). */
  historyShare: (vehicleId: string) =>
    run(async () => {
      const rows = must(await sb().rpc("my_history_share", { p_vehicle: vehicleId })) as {
        token: string;
        expires_at: string;
      }[];
      return rows[0] ?? null;
    }),
  /** A new link (any older one stops working). */
  createHistoryShare: (vehicleId: string) =>
    run(async () => must(await sb().rpc("create_history_share", { p_vehicle: vehicleId })) as string),
  revokeHistoryShare: (vehicleId: string) =>
    run(async () => {
      must(await sb().rpc("revoke_history_share", { p_vehicle: vehicleId }));
    }),
};

export type RecordsServiceApi = typeof realRecordsService;
export const recordsService: RecordsServiceApi = config.demoMode ? demoRecordsService : realRecordsService;

/** Receipts that belong to one mod or one maintenance record. */
export const receiptsFor = (all: readonly ReceiptRow[], item: ReceiptFor) =>
  all.filter((r) => ("modId" in item ? r.mod_id === item.modId : r.maintenance_id === item.maintenanceId));

/** The path a service-history link opens (anyone with it can view; nothing else about the owner shows). */
export const historyPath = (token: string) => `/history/${token}` as const;
