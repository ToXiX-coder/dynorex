import { demoBuildService } from "@/demo/services";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import type { SpecDeltas } from "@/domain/specs";
import type { ModForm, VehicleForm } from "@/domain/validation/build";
import { getSupabase } from "@/services/supabase/client";
import type {
  CostSummaryRow,
  ModPhotoRow,
  ModRow,
  SpecEstimateRow,
  VehicleRow,
  WishlistItemRow,
} from "@/services/supabase/database.types";

/**
 * Garage, vehicles, mods, costs and wishlist. Every call runs as the signed-in user under RLS, so the
 * database enforces ownership, plan limits and validation. Creates carry a client_ref so a retry or an
 * offline replay returns the existing row instead of making a duplicate.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export const PAGE_SIZE = 20;

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
const isDuplicate = (e: unknown) => (e as { code?: string })?.code === "23505";
/** A public vehicle gets its public build page (one per vehicle). The server re-checks everything. */
async function ensurePublicPage(vehicleId: string) {
  must(await sb().rpc("publish_build", { p_vehicle_id: vehicleId, p_public: true }));
}

export type VehicleCard = Pick<
  VehicleRow,
  | "id"
  | "year"
  | "make"
  | "model"
  | "trim_level"
  | "nickname"
  | "hero_path"
  | "visibility"
  | "baseline_hp"
  | "baseline_looked_up"
  | "updated_at"
  | "sold_at"
  | "kind"
  | "motor_w"
>;

/** Factory stock specs for a car (what fills any stock number left blank), or null when none are on file. */
export type StockLookup = {
  label: string;
  hp: number;
  torque_lbft: number;
  weight_lb: number | null;
  zero_to_sixty_s: number | null;
} | null;

const realBuildService = {
  // ------------------------------------------------------------ vehicles
  listVehicles: (page = 0) =>
    run(
      async () =>
        must(
          await sb()
            .from("vehicles")
            .select(
              "id, year, make, model, trim_level, nickname, hero_path, visibility, baseline_hp, baseline_looked_up, updated_at, sold_at, kind, motor_w",
            )
            .order("created_at", { ascending: false })
            .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
        ) as VehicleCard[],
    ),

  lookupStockSpecs: (car: { year: number; make: string; model: string; trim: string | null }) =>
    run(async () => {
      const r = must(
        await sb().rpc("lookup_stock_specs", {
          p_year: car.year,
          p_make: car.make,
          p_model: car.model,
          p_trim: car.trim,
        }),
      ) as {
        label: string;
        hp: number | string;
        torque_lbft: number | string;
        weight_lb: number | string | null;
        zero_to_sixty_s: number | string | null;
      } | null;
      if (!r) return null as StockLookup;
      const n = (v: number | string | null) => (v === null ? null : Number(v));
      return {
        label: r.label,
        hp: Number(r.hp),
        torque_lbft: Number(r.torque_lbft),
        weight_lb: n(r.weight_lb),
        zero_to_sixty_s: n(r.zero_to_sixty_s),
      } as StockLookup;
    }),

  getVehicle: (id: string) =>
    run(async () => must(await sb().from("vehicles").select("*").eq("id", id).maybeSingle()) as VehicleRow | null),

  createVehicle: (
    input: VehicleForm & {
      data_source: "manual" | "nhtsa";
      nhtsa_make_id: number | null;
      nhtsa_model_id: number | null;
    },
    clientRef: string,
  ) =>
    run(async () => {
      const baseline_source =
        (input.baseline_hp ?? input.baseline_torque_lbft ?? input.baseline_weight_lb ?? input.baseline_zero_to_sixty_s)
          ? ("user_reported" as const)
          : null;
      const res = await sb()
        .from("vehicles")
        .insert({ ...input, baseline_source, client_ref: clientRef })
        .select("id")
        .single();
      const id =
        res.error && isDuplicate(res.error)
          ? // already saved by an earlier attempt: return that one
            (must(await sb().from("vehicles").select("id").eq("client_ref", clientRef).single())!.id as string)
          : (must(res)!.id as string);
      if (input.visibility === "public") await ensurePublicPage(id);
      return id;
    }),

  updateVehicle: (id: string, input: VehicleForm) =>
    run(async () => {
      const baseline_source =
        (input.baseline_hp ?? input.baseline_torque_lbft ?? input.baseline_weight_lb ?? input.baseline_zero_to_sixty_s)
          ? ("user_reported" as const)
          : null;
      must(
        await sb()
          .from("vehicles")
          .update({ ...input, baseline_source })
          .eq("id", id)
          .select("id")
          .single(),
      );
      if (input.visibility === "public") await ensurePublicPage(id);
    }),

  /** D-68: the quick mileage update on the car page (the edit screen still corrects mistakes). */
  setOdometer: (id: string, odometer: number) =>
    run(async () => {
      must(await sb().from("vehicles").update({ odometer }).eq("id", id).select("id").single());
    }),

  /** D-68: the car's private build budget; null clears it. */
  setBudget: (id: string, budget: { minor: number; currency: string } | null) =>
    run(async () => {
      must(
        await sb()
          .from("vehicles")
          .update({ budget_minor: budget?.minor ?? null, budget_currency: budget?.currency ?? null })
          .eq("id", id)
          .select("id")
          .single(),
      );
    }),

  deleteVehicle: (id: string) =>
    run(async () => {
      const ok = must(await sb().rpc("soft_delete_vehicle", { p_vehicle_id: id }));
      if (!ok) throw { code: "not_found" };
    }),

  specEstimate: (vehicleId: string) =>
    run(
      async () =>
        (must(await sb().rpc("vehicle_spec_estimate", { p_vehicle_id: vehicleId })) as SpecEstimateRow[])[0] ?? null,
    ),

  costSummary: (vehicleId: string) =>
    run(async () => must(await sb().rpc("vehicle_cost_summary", { p_vehicle_id: vehicleId })) as CostSummaryRow[]),

  myPlan: () =>
    run(async () => {
      const rows = must(await sb().rpc("my_plan")) as {
        plus: boolean;
        vehicle_limit: number | null;
        mods_per_vehicle_limit: number | null;
      }[];
      return rows[0] ?? { plus: false, vehicle_limit: 2, mods_per_vehicle_limit: 20 };
    }),

  // ------------------------------------------------------------ mods
  /** Newest first, paginated. */
  listMods: (vehicleId: string, page = 0) =>
    run(
      async () =>
        must(
          await sb()
            .from("mods")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("created_at", { ascending: false })
            .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
        ) as ModRow[],
    ),

  getMod: (id: string) =>
    run(async () => must(await sb().from("mods").select("*").eq("id", id).maybeSingle()) as ModRow | null),

  modPhotos: (modId: string) =>
    run(
      async () =>
        must(
          await sb().from("mod_photos").select("*").eq("mod_id", modId).order("position", { ascending: true }),
        ) as ModPhotoRow[],
    ),

  createMod: (vehicleId: string, input: ModForm, deltas: SpecDeltas, clientRef: string) =>
    run(async () => {
      const res = await sb()
        .from("mods")
        .insert({ vehicle_id: vehicleId, ...input, spec_deltas: deltas, client_ref: clientRef })
        .select("id")
        .single();
      if (res.error && isDuplicate(res.error)) {
        return must(await sb().from("mods").select("id").eq("client_ref", clientRef).single())!.id as string;
      }
      return must(res)!.id as string;
    }),

  updateMod: (id: string, input: ModForm, deltas: SpecDeltas) =>
    run(async () => {
      must(
        await sb()
          .from("mods")
          .update({ ...input, spec_deltas: deltas })
          .eq("id", id)
          .select("id")
          .single(),
      );
    }),

  setModStatus: (id: string, status: ModRow["status"]) =>
    run(async () => {
      must(await sb().from("mods").update({ status }).eq("id", id).select("id").single());
    }),

  deleteMod: (id: string) =>
    run(async () => {
      const ok = must(await sb().rpc("soft_delete_mod", { p_mod_id: id }));
      if (!ok) throw { code: "not_found" };
    }),

  deletePhoto: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_mod_photo", { p_photo_id: id }));
    }),

  // ------------------------------------------------------------ wishlist
  listWishlist: () =>
    run(
      async () =>
        must(
          await sb().from("wishlist_items").select("*").order("created_at", { ascending: false }),
        ) as WishlistItemRow[],
    ),

  addWishlist: (item: Pick<WishlistItemRow, "name" | "url" | "price_minor" | "currency" | "notes" | "vehicle_id">) =>
    run(async () => {
      must(await sb().from("wishlist_items").insert(item).select("id").single());
    }),

  deleteWishlist: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_wishlist_item", { p_id: id }));
    }),
};

export type BuildServiceApi = typeof realBuildService;
/** Pitch mode swaps in the in-memory sample backend (src/demo). */
export const buildService: BuildServiceApi = config.demoMode ? demoBuildService : realBuildService;
