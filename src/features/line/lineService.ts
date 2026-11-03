import { demoLineService } from "@/demo/v2";
import type { TrackPoint } from "@/domain/routes";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { PublicRoute, RouteRow } from "@/services/supabase/database.types";

/**
 * Line: drives. Saving goes through save_route(), which validates the track, computes distance and time,
 * enforces the monthly limit and trims shared routes on the server. Full tracks are owner-only.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type MyRoute = Pick<
  RouteRow,
  "id" | "title" | "visibility" | "distance_m" | "duration_s" | "started_at" | "created_at"
> & { points?: RouteRow["points"]; public_points?: RouteRow["public_points"] };
export type RouteMode = "top" | "new" | "nearby";

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

const realLineService = {
  myRoutes: (page = 0) =>
    run(
      async () =>
        must(
          await sb()
            .from("routes")
            .select("id, title, visibility, distance_m, duration_s, started_at, created_at")
            .order("created_at", { ascending: false })
            .range(page * 20, page * 20 + 19),
        ) as MyRoute[],
    ),
  /** Recordings this calendar month (deleted ones still count, as on the server). Owner view only. */
  myRoute: (id: string) =>
    run(async () => must(await sb().from("routes").select("*").eq("id", id).maybeSingle()) as RouteRow | null),
  publicRoute: (id: string) =>
    run(
      async () =>
        must(await sb().from("public_routes").select("*").eq("route_id", id).maybeSingle()) as PublicRoute | null,
    ),
  discover: (mode: RouteMode, page = 0) =>
    run(async () => must(await sb().rpc("discover_routes", { p_mode: mode, p_page: page })) as PublicRoute[]),
  save: (clientRef: string, title: string, description: string | null, points: TrackPoint[], makePublic: boolean) =>
    run(
      async () =>
        must(
          await sb().rpc("save_route", {
            p_client_ref: clientRef,
            p_title: title,
            p_description: description,
            p_points: points,
            p_public: makePublic,
          }),
        ) as string,
    ),
  setPublic: (id: string, makePublic: boolean) =>
    run(async () => {
      must(await sb().rpc("set_route_public", { p_route: id, p_public: makePublic }));
    }),
  remove: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_route", { p_route: id }));
    }),
  /** Drives recorded this month as the server counts them (deleted ones included); limit null = unlimited. */
  usage: () =>
    run(async () => {
      const rows = must(await sb().rpc("my_route_usage")) as { used: number; monthly_limit: number | null }[];
      return rows[0] ?? null;
    }),
  myRating: (routeId: string) =>
    run(async () => {
      const r = must(await sb().from("route_ratings").select("stars").eq("route_id", routeId).maybeSingle()) as {
        stars: number;
      } | null;
      return r?.stars ?? null;
    }),
  /** One rating per person; changing it updates the same row. */
  rate: (routeId: string, stars: number) =>
    run(async () => {
      const existing = must(await sb().from("route_ratings").select("stars").eq("route_id", routeId).maybeSingle());
      if (existing)
        must(await sb().from("route_ratings").update({ stars }).eq("route_id", routeId).select("stars").single());
      else must(await sb().from("route_ratings").insert({ route_id: routeId, stars }).select("stars").single());
    }),
};

export type LineServiceApi = typeof realLineService;
export const lineService: LineServiceApi = config.demoMode ? demoLineService : realLineService;
