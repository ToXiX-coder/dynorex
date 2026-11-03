import { demoReviewService } from "@/demo/upgrades";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { RouteAspects, RouteReview, RouteReviewSummary } from "@/services/supabase/database.types";

/**
 * Road reviews (D-61): overall stars plus scenery, surface and traffic (5 = empty road), and an optional comment
 * shown publicly with your username. One review per person per route; changing it updates the same row.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type MyReview = RouteAspects & { stars: number; comment: string | null };

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
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const realReviewService = {
  summary: (routeId: string) =>
    run(async () => {
      const r = (must(await sb().rpc("route_review_summary", { p_route: routeId })) as RouteReviewSummary[])[0];
      // numeric columns can arrive as strings
      return {
        reviews: Number(r?.reviews ?? 0),
        stars: num(r?.stars),
        scenery: num(r?.scenery),
        surface: num(r?.surface),
        traffic: num(r?.traffic),
      } satisfies RouteReviewSummary;
    }),
  reviews: (routeId: string) =>
    run(async () => must(await sb().rpc("route_reviews", { p_route: routeId })) as RouteReview[]),
  mine: (routeId: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("route_ratings")
            .select("stars, scenery, surface, traffic, comment")
            .eq("route_id", routeId)
            .maybeSingle(),
        ) as MyReview | null,
    ),
  save: (routeId: string, review: MyReview) =>
    run(async () => {
      const existing = must(await sb().from("route_ratings").select("stars").eq("route_id", routeId).maybeSingle());
      if (existing)
        must(await sb().from("route_ratings").update(review).eq("route_id", routeId).select("stars").single());
      else
        must(
          await sb()
            .from("route_ratings")
            .insert({ route_id: routeId, ...review })
            .select("stars")
            .single(),
        );
    }),
};

export type ReviewServiceApi = typeof realReviewService;
export const reviewService: ReviewServiceApi = config.demoMode ? demoReviewService : realReviewService;

/** The three aspects, in the order they're shown, with what 1 and 5 mean. */
export const ASPECTS = [
  { key: "scenery", label: "Scenery", low: "Plain", high: "Stunning" },
  { key: "surface", label: "Surface", low: "Rough", high: "Smooth" },
  { key: "traffic", label: "Traffic", low: "Busy", high: "Empty" },
] as const;
