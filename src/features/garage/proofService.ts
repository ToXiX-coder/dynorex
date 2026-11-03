import { demoProofService } from "@/demo/research";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type {
  DynoResultInput,
  DynoResultRow,
  PublicDynoResult,
  PublicTrackLap,
  TrackLapInput,
  TrackLapRow,
  VehicleRecall,
} from "@/services/supabase/database.types";

/**
 * D-62: the dyno log, track laps and recalls for one car. Dyno results and laps are the owner's own, entered from a
 * shop's sheet or a lap-timer app; a shared one shows on the public build as numbers only. Recalls come from NHTSA by
 * make, model and year (checked daily on the server), never by VIN.
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
// numeric columns can arrive as strings
const dynoRow = (r: DynoResultRow): DynoResultRow => ({
  ...r,
  whp: Number(r.whp),
  wtq: r.wtq === null ? null : Number(r.wtq),
});

const realProofService = {
  dynoResults: (vehicleId: string) =>
    run(async () =>
      (
        must(
          await sb()
            .from("dyno_results")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("measured_on", { ascending: false }),
        ) as DynoResultRow[]
      ).map(dynoRow),
    ),
  addDyno: (input: DynoResultInput) =>
    run(async () => (must(await sb().from("dyno_results").insert(input).select("id").single()) as { id: string }).id),
  setDynoShared: (id: string, shared: boolean) =>
    run(async () => {
      must(await sb().from("dyno_results").update({ shared }).eq("id", id).select("id").single());
    }),
  removeDyno: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_dyno_result", { p_id: id }));
    }),
  publicDyno: (vehicleId: string) =>
    run(async () =>
      (
        must(
          await sb()
            .from("public_dyno_results")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("measured_on", { ascending: false }),
        ) as PublicDynoResult[]
      ).map((r) => ({ ...r, whp: Number(r.whp), wtq: r.wtq === null ? null : Number(r.wtq) })),
    ),

  laps: (vehicleId: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("track_laps")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("driven_on", { ascending: false }),
        ) as TrackLapRow[],
    ),
  addLaps: (inputs: TrackLapInput[]) =>
    run(async () => {
      must(await sb().from("track_laps").insert(inputs).select("id"));
    }),
  setLapShared: (id: string, shared: boolean) =>
    run(async () => {
      must(await sb().from("track_laps").update({ shared }).eq("id", id).select("id").single());
    }),
  removeLap: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_track_lap", { p_id: id }));
    }),
  publicLaps: (vehicleId: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_track_laps")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("lap_ms", { ascending: true }),
        ) as PublicTrackLap[],
    ),

  recalls: (vehicleId: string) =>
    run(async () => must(await sb().rpc("my_vehicle_recalls", { p_vehicle: vehicleId })) as VehicleRecall[]),
  setRecallDismissed: (vehicleId: string, campaign: string, dismissed: boolean) =>
    run(async () => {
      must(
        await sb().rpc("set_recall_dismissed", { p_vehicle: vehicleId, p_campaign: campaign, p_dismissed: dismissed }),
      );
    }),
};

export type ProofServiceApi = typeof realProofService;
export const proofService: ProofServiceApi = config.demoMode ? demoProofService : realProofService;
