import { demoSocialService } from "@/demo/services";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type {
  Database,
  FeedItem,
  NotificationCategory,
  NotificationPrefRow,
  NotificationRow,
  PublicBuild,
  PublicSpecRow,
  SearchHit,
  VehicleKind,
} from "@/services/supabase/database.types";

/**
 * Public pages, follows, Discover, search, the home feed and notifications. Public data comes only
 * from the public_* views and the server functions built on them, so whatever the server decides is
 * visible is all the app can ever receive. Nothing here is written to the offline cache: other
 * people's content must disappear as soon as its owner makes it private (see docs/decisions.md D-25).
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type PublicProfile = Database["public"]["Views"]["public_profiles"]["Row"];
export type PublicMod = Database["public"]["Views"]["public_mods"]["Row"];
export type PublicPhoto = Database["public"]["Views"]["public_mod_photos"]["Row"];
export type DiscoverMode = "trending" | "new" | "for_you";
export const FEED_PAGE = 20;

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
async function uid(): Promise<string> {
  const { data } = await sb().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw { message: "sign_in_required", code: "P0001" };
  return id;
}

export type PublicBuildPage =
  | { status: "not_found" | "gone" }
  | { status: "public"; build: PublicBuild; specs: PublicSpecRow | null; mods: PublicMod[] };

const realSocialService = {
  // ------------------------------------------------------------ public build pages
  /** Status first, so private / hidden / never-existed all render the same "not found". */
  publicBuild: (vehicleId: string, page = 0) =>
    run<PublicBuildPage>(async () => {
      const status = must(await sb().rpc("public_build_status", { p_vehicle_id: vehicleId })) ?? "not_found";
      if (status !== "public") return { status };
      const [b, s, m] = await Promise.all([
        sb().from("public_builds").select("*").eq("vehicle_id", vehicleId).maybeSingle(),
        sb().rpc("public_build_specs", { p_vehicle_id: vehicleId }),
        sb()
          .from("public_mods")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .order("created_at", { ascending: false })
          .range(page * FEED_PAGE, page * FEED_PAGE + FEED_PAGE - 1),
      ]);
      const build = must(b) as PublicBuild | null;
      // it went private between the two calls: same answer as private
      if (!build) return { status: "not_found" };
      return {
        status: "public",
        build,
        specs: ((must(s) as PublicSpecRow[]) ?? [])[0] ?? null,
        mods: must(m) as PublicMod[],
      };
    }),

  publicMods: (vehicleId: string, page: number) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_mods")
            .select("*")
            .eq("vehicle_id", vehicleId)
            .order("created_at", { ascending: false })
            .range(page * FEED_PAGE, page * FEED_PAGE + FEED_PAGE - 1),
        ) as PublicMod[],
    ),

  publicMod: (vehicleId: string, modId: string) =>
    run(async () => {
      const [m, p] = await Promise.all([
        sb().from("public_mods").select("*").eq("mod_id", modId).eq("vehicle_id", vehicleId).maybeSingle(),
        sb().from("public_mod_photos").select("*").eq("mod_id", modId).order("position", { ascending: true }),
      ]);
      const mod = must(m) as PublicMod | null;
      return mod ? { mod, photos: must(p) as PublicPhoto[] } : null;
    }),

  publicBuildsBy: (username: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_builds")
            .select("*")
            .eq("owner_username", username)
            .order("last_activity_at", { ascending: false })
            .limit(20),
        ) as PublicBuild[],
    ),

  /** 5-minute signed URLs for public photos, after the server re-checks visibility as this viewer. */
  publicMedia: (req: { heroes?: string[]; photos?: string[] }) =>
    run(async () => {
      const { data, error } = await sb().functions.invoke<{
        heroes: Record<string, string>;
        photos: Record<string, string>;
      }>("public-media", { body: req });
      if (error) throw error;
      return data ?? { heroes: {}, photos: {} };
    }),

  // ------------------------------------------------------------ publishing and sharing
  /** Owner only. Creates the build page if needed and sets the vehicle + build visibility together. */
  setBuildPublic: (vehicleId: string, makePublic: boolean) =>
    run(async () => must(await sb().rpc("publish_build", { p_vehicle_id: vehicleId, p_public: makePublic }))),

  /** Server confirms the build is public right now and returns its canonical path. */
  shareLink: (vehicleId: string) =>
    run(async () => must(await sb().rpc("share_build_link", { p_vehicle_id: vehicleId })) as string),

  // ------------------------------------------------------------ follows
  isFollowingBuild: (buildId: string) =>
    run(async () => {
      const me = await uid();
      const r = must(await sb().from("build_follows").select("build_id").eq("user_id", me).eq("build_id", buildId));
      return (r ?? []).length > 0;
    }),
  followBuild: (buildId: string) =>
    run(async () => {
      must(await sb().from("build_follows").insert({ build_id: buildId }).select("build_id").single());
    }),
  unfollowBuild: (buildId: string) =>
    run(async () => {
      const me = await uid();
      must(await sb().from("build_follows").delete().eq("user_id", me).eq("build_id", buildId));
    }),

  isFollowingUser: (userId: string) =>
    run(async () => {
      const me = await uid();
      const r = must(await sb().from("follows").select("followee_id").eq("follower_id", me).eq("followee_id", userId));
      return (r ?? []).length > 0;
    }),
  followUser: (userId: string) =>
    run(async () => {
      must(await sb().from("follows").insert({ followee_id: userId }).select("followee_id").single());
    }),
  unfollowUser: (userId: string) =>
    run(async () => {
      const me = await uid();
      must(await sb().from("follows").delete().eq("follower_id", me).eq("followee_id", userId));
    }),

  /** People I follow / who follow me, as public profiles (blocked and hidden accounts drop out). */
  myConnections: (which: "following" | "followers") =>
    run(async () => {
      const me = await uid();
      const ids =
        which === "following"
          ? (must(await sb().from("follows").select("followee_id").eq("follower_id", me).limit(200)) ?? []).map(
              (e) => e.followee_id,
            )
          : (must(await sb().from("follows").select("follower_id").eq("followee_id", me).limit(200)) ?? []).map(
              (e) => e.follower_id,
            );
      if (ids.length === 0) return [] as PublicProfile[];
      return must(await sb().from("public_profiles").select("*").in("user_id", ids)) as PublicProfile[];
    }),

  // ------------------------------------------------------------ discover, nearby, search, feed
  discover: (mode: DiscoverMode, page = 0) =>
    run(async () => must(await sb().rpc("discover_builds", { p_mode: mode, p_page: page })) as PublicBuild[]),

  nearby: (page = 0) => run(async () => must(await sb().rpc("nearby_builds", { p_page: page })) as PublicBuild[]),
  myRegion: () =>
    run(async () => {
      const rows = must(await sb().rpc("my_region")) as { enabled: boolean; share_builds: boolean }[];
      return rows[0] ?? null;
    }),
  setRegion: (cell: { cell_lat: number; cell_lon: number }, shareBuilds: boolean) =>
    run(async () => {
      must(
        await sb().rpc("set_my_region", {
          p_cell_lat: cell.cell_lat,
          p_cell_lon: cell.cell_lon,
          p_share_builds: shareBuilds,
        }),
      );
    }),
  clearRegion: () =>
    run(async () => {
      must(await sb().rpc("clear_my_region"));
    }),

  search: (query: string) => run(async () => must(await sb().rpc("search_public", { p_query: query })) as SearchHit[]),

  /** D-71: the kind of each public build in a search result, for the Car / Motorcycle / E-bike filter. */
  buildKinds: (vehicleIds: string[]) =>
    run(async () => {
      if (!vehicleIds.length) return {} as Record<string, VehicleKind>;
      const rows = must(
        await sb().from("public_builds").select("vehicle_id, kind").in("vehicle_id", vehicleIds.slice(0, 100)),
      ) as { vehicle_id: string; kind: VehicleKind | null }[];
      return Object.fromEntries(rows.map((r) => [r.vehicle_id, r.kind ?? "car"])) as Record<string, VehicleKind>;
    }),

  homeFeed: (page = 0) => run(async () => must(await sb().rpc("home_feed", { p_page: page })) as FeedItem[]),

  buildOfTheWeek: () => run(async () => must(await sb().from("public_build_of_the_week").select("*").maybeSingle())),

  // ------------------------------------------------------------ notifications
  notifications: (page = 0) =>
    run(
      async () =>
        must(
          await sb()
            .from("notifications")
            .select("*")
            .order("created_at", { ascending: false })
            .range(page * FEED_PAGE, page * FEED_PAGE + FEED_PAGE - 1),
        ) as NotificationRow[],
    ),
  unreadCount: () =>
    run(async () => {
      const r = await sb().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      if (r.error) throw r.error;
      return r.count ?? 0;
    }),
  markRead: (id: string) =>
    run(async () => {
      must(
        await sb()
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .single(),
      );
    }),
  markAllRead: () => run(async () => must(await sb().rpc("mark_all_notifications_read")) as number),

  prefs: () => run(async () => must(await sb().from("notification_prefs").select("*")) as NotificationPrefRow[]),
  /** Resolves only after the server has stored the change. */
  setPref: (category: NotificationCategory, enabled: boolean) =>
    run(async () => must(await sb().rpc("set_notification_pref", { p_category: category, p_enabled: enabled }))),
};

export type SocialServiceApi = typeof realSocialService;
export const socialService: SocialServiceApi = config.demoMode ? demoSocialService : realSocialService;
