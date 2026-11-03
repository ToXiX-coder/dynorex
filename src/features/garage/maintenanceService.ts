import { demoMaintenanceService } from "@/demo/extras";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { MaintenanceInput, MaintenanceRecord, VehiclePhotoRow } from "@/services/supabase/database.types";

/**
 * Maintenance log and the per-car photo gallery (D-58). Both are the owner's own rows (row-level security);
 * gallery photos are added only through the register-photo Edge Function, like build photos.
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

const realMaintenanceService = {
  /** Every record you own, or one car's (newest first). */
  list: (vehicleId?: string) =>
    run(async () => {
      let q = sb().from("maintenance_records").select("*");
      if (vehicleId) q = q.eq("vehicle_id", vehicleId);
      return must(await q.order("done_on", { ascending: false }).limit(500)) as MaintenanceRecord[];
    }),
  add: (vehicleId: string, input: MaintenanceInput) =>
    run(
      async () =>
        (
          must(
            await sb()
              .from("maintenance_records")
              .insert({ vehicle_id: vehicleId, ...input })
              .select("id")
              .single(),
          ) as { id: string }
        ).id,
    ),
  update: (id: string, input: MaintenanceInput) =>
    run(async () => {
      must(await sb().from("maintenance_records").update(input).eq("id", id).select("id").single());
    }),
  remove: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_maintenance", { p_id: id }));
    }),
  /** Your own gallery for one car (paths are signed for you by SignedImage). */
  gallery: (vehicleId: string) =>
    run(
      async () =>
        must(
          await sb().from("vehicle_photos").select("*").eq("vehicle_id", vehicleId).order("position"),
        ) as VehiclePhotoRow[],
    ),
  removePhoto: (photoId: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_vehicle_photo", { p_photo: photoId }));
    }),
  /** D-68: one of the car's own gallery photos becomes its cover (removing that photo later clears the cover). */
  setCover: (photoId: string) =>
    run(async () => {
      const ok = must(await sb().rpc("set_cover_photo", { p_photo: photoId }));
      if (!ok) throw { code: "not_found" };
    }),
  /** A public build's gallery (ids only; URLs come from public-media). */
  publicGallery: (vehicleId: string) =>
    run(
      async () =>
        must(
          await sb().from("public_vehicle_photos").select("photo_id").eq("vehicle_id", vehicleId).order("position"),
        ) as { photo_id: string }[],
    ),
  publicGalleryUrls: (photoIds: string[]) =>
    run(async () => {
      if (!photoIds.length) return {} as Record<string, string>;
      const { data, error } = await sb().functions.invoke<{ gallery?: Record<string, string> }>("public-media", {
        body: { gallery: photoIds.slice(0, 30) },
      });
      if (error) throw error;
      return data?.gallery ?? {};
    }),
};

export type MaintenanceServiceApi = typeof realMaintenanceService;
export const maintenanceService: MaintenanceServiceApi = config.demoMode
  ? demoMaintenanceService
  : realMaintenanceService;
