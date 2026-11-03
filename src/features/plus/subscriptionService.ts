import { demoSubscriptionService } from "@/demo/services";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type {
  AdvancedSpecs,
  BuildAnalyticsRow,
  CapabilitiesRow,
  MySubscriptionRow,
  StickerKind,
} from "@/services/supabase/database.types";

/**
 * Dynorex+ status and Plus-only features. Everything is decided by the server: this only reads what
 * it says. A store purchase becomes Dynorex+ only after `sync()` (or the store webhook) has recorded the
 * verified purchase.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export const FREE_SUBSCRIPTION: MySubscriptionRow = {
  plus: false,
  status: null,
  product_id: null,
  platform: null,
  expires_at: null,
  grace_until: null,
  will_renew: false,
  via_override: false,
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

const realSubscriptionService = {
  mySubscription: () =>
    run(async () => (must(await sb().rpc("my_subscription")) as MySubscriptionRow[])[0] ?? FREE_SUBSCRIPTION),

  capabilities: () => run(async () => (must(await sb().rpc("plan_capabilities")) as CapabilitiesRow[])[0] ?? null),

  /** Ask the server to read the store's current state (after purchase or restore). */
  sync: () =>
    run(async () => {
      const { data, error } = await sb().functions.invoke<{ subscription: MySubscriptionRow | null }>(
        "subscription-sync",
        { method: "POST" },
      );
      if (error) throw error;
      return data?.subscription ?? FREE_SUBSCRIPTION;
    }),

  advancedSpecs: (vehicleId: string) =>
    run(async () => must(await sb().rpc("advanced_spec_estimate", { p_vehicle_id: vehicleId })) as AdvancedSpecs),

  analytics: (vehicleId: string) =>
    run(
      async () =>
        (must(await sb().rpc("my_build_analytics", { p_vehicle_id: vehicleId })) as BuildAnalyticsRow[])[0] ?? null,
    ),

  /** Counts per sticker on a public build (anyone can see them). */
  reactions: (buildId: string) =>
    run(
      async () =>
        must(await sb().from("public_build_reactions").select("sticker, reactions").eq("build_id", buildId)) as {
          sticker: StickerKind;
          reactions: number;
        }[],
    ),
  /** Stickers I've put on this build (RLS returns only my own rows). */
  myReactions: (buildId: string) =>
    run(async () =>
      (must(await sb().from("build_reactions").select("sticker").eq("build_id", buildId)) ?? []).map(
        (r) => r.sticker as StickerKind,
      ),
    ),
  /** Refused by the server unless the caller has Dynorex+. */
  react: (buildId: string, sticker: StickerKind) =>
    run(async () => {
      must(await sb().from("build_reactions").insert({ build_id: buildId, sticker }).select("sticker").single());
    }),
  unreact: (buildId: string, sticker: StickerKind) =>
    run(async () => {
      const { data } = await sb().auth.getSession();
      const me = data.session?.user.id;
      if (!me) throw { message: "sign_in_required", code: "P0001" };
      must(
        await sb().from("build_reactions").delete().eq("build_id", buildId).eq("user_id", me).eq("sticker", sticker),
      );
    }),

  /** Counts a signed-in view of a public build (the server skips owners and repeats the same day). */
  recordView: (vehicleId: string) =>
    run(async () => {
      must(await sb().rpc("record_build_view", { p_vehicle_id: vehicleId }));
    }),
};

export type SubscriptionServiceApi = typeof realSubscriptionService;
export const subscriptionService: SubscriptionServiceApi = config.demoMode
  ? demoSubscriptionService
  : realSubscriptionService;
