import { demoPerfService } from "@/demo/proveIt";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { FitmentRow, PerfRunInput, PerfRunRow, PublicPerfRun } from "@/services/supabase/database.types";

/**
 * Performance runs and owner fitment (D-60). Runs are the owner's own rows; a run marked shared shows on the
 * public build as numbers only. Fitment is counted on the server from public builds only.
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

const realPerfService = {
  /** Your runs for one car, newest first (traces included: they're yours). */
  list: (vehicleId: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("perf_runs")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("ran_at", { ascending: false })
            .limit(200),
        ) as PerfRunRow[],
    ),
  save: (input: PerfRunInput) =>
    run(async () => (must(await sb().from("perf_runs").insert(input).select("id").single()) as { id: string }).id),
  setShared: (id: string, shared: boolean) =>
    run(async () => {
      must(await sb().from("perf_runs").update({ shared }).eq("id", id).select("id").single());
    }),
  remove: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_perf_run", { p_run: id }));
    }),
  /** Shared runs on a public build. */
  publicRuns: (vehicleId: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_perf_runs")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("ran_at", { ascending: false })
            .limit(50),
        ) as PublicPerfRun[],
    ),
  /** What owners of this car run (public builds, same make and model, year within 3). */
  fitment: (car: { make: string; model: string; year: number }, category?: string | null, terms?: string | null) =>
    run(
      async () =>
        must(
          await sb().rpc("owner_fitment", {
            p_make: car.make,
            p_model: car.model,
            p_year: car.year,
            p_category: category ?? null,
            p_terms: terms ?? null,
          }),
        ) as FitmentRow[],
    ),
};

export type PerfServiceApi = typeof realPerfService;
export const perfService: PerfServiceApi = config.demoMode ? demoPerfService : realPerfService;
