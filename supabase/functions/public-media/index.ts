// POST /functions/v1/public-media
// Body: { heroes?: string[] (vehicle ids), photos?: string[] (mod photo ids), listings?: string[] (Shop listing
// ids), gallery?: string[] (vehicle gallery photo ids), events?: string[] (event album photo ids, D-61) }, at most
// 30 ids in total.
// Returns { heroes: { [vehicleId]: url }, photos: { [photoId]: url }, listings: { [listingId]: url } } with
// 5-minute signed URLs.
//
// The media bucket is private. This is the ONLY public path to a photo:
//   1. visibility is checked AS THE CALLER (guest or signed in) through the public_* views, so blocks,
//      moderation hides, deletion and private parents all apply exactly as on the page itself
//   2. only ids that passed step 1 are looked up with the service role to find their storage paths
//   3. paths are signed for 5 minutes and never returned; responses are not cacheable
// Unknown, private and hidden ids are simply missing from the answer (no "forbidden" that would
// confirm they exist).
// NOT YET RUN: needs Deno + Supabase.
import { adminClient, errorResponse, HttpError, userClient } from "../_shared/auth.ts";

const BUCKET = "vehicle-media";
const MAX_IDS = 30;
const TTL_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function ids(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && UUID.test(x))) {
    throw new HttpError(400, "That photo didn't load.");
  }
  return [...new Set(v as string[])];
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    const caller = userClient(req); // anon key for guests, user JWT when signed in
    const body = (await req.json().catch(() => ({}))) as {
      heroes?: unknown;
      photos?: unknown;
      listings?: unknown;
      gallery?: unknown;
      events?: unknown;
    };
    const heroIds = ids(body.heroes);
    const photoIds = ids(body.photos);
    const listingIds = ids(body.listings);
    const galleryIds = ids(body.gallery);
    const eventIds = ids(body.events);
    if (heroIds.length + photoIds.length + listingIds.length + galleryIds.length + eventIds.length > MAX_IDS) throw new HttpError(400, "That photo didn't load.");

    // 1. visibility, as the caller
    const visibleHeroes = heroIds.length
      ? ((await caller.from("public_vehicles").select("vehicle_id").in("vehicle_id", heroIds).eq("has_hero", true))
          .data ?? []).map((r) => r.vehicle_id as string)
      : [];
    const visiblePhotos = photoIds.length
      ? ((await caller.from("public_mod_photos").select("photo_id").in("photo_id", photoIds)).data ?? []).map(
          (r) => r.photo_id as string,
        )
      : [];
    const visibleListings = listingIds.length
      ? ((await caller.from("public_listings").select("listing_id").in("listing_id", listingIds).eq("has_photo", true))
          .data ?? []).map((r) => r.listing_id as string)
      : [];

    const visibleGallery = galleryIds.length
      ? ((await caller.from("public_vehicle_photos").select("photo_id").in("photo_id", galleryIds)).data ?? []).map(
          (r) => r.photo_id as string,
        )
      : [];

    const visibleEvents = eventIds.length
      ? ((await caller.from("public_event_photos").select("photo_id").in("photo_id", eventIds)).data ?? []).map(
          (r) => r.photo_id as string,
        )
      : [];

    // 2. storage paths for those ids only
    const admin = adminClient();
    // signed-in callers: 300 signing calls an hour (guests are limited by the API gateway)
    const { data: who } = await caller.auth.getUser().catch(() => ({ data: { user: null } }));
    if (who?.user) {
      const { error: rl } = await admin.rpc("enforce_rate_limit_for", {
        p_user: who.user.id,
        p_action: "public_media",
        p_max: 300,
        p_window_seconds: 3600,
      });
      if (rl) throw new HttpError(429, "You're moving fast. Wait a minute and try again.", 3600);
    }
    const heroPaths = visibleHeroes.length
      ? ((await admin.from("vehicles").select("id, hero_path").in("id", visibleHeroes)).data ?? [])
      : [];
    const photoPaths = visiblePhotos.length
      ? ((await admin.from("mod_photos").select("id, storage_path").in("id", visiblePhotos).is("deleted_at", null))
          .data ?? [])
      : [];
    const listingPaths = visibleListings.length
      ? ((await admin.from("listings").select("id, photo_path").in("id", visibleListings)).data ?? [])
      : [];

    const galleryPaths = visibleGallery.length
      ? ((await admin.from("vehicle_photos").select("id, storage_path").in("id", visibleGallery).is("deleted_at", null))
          .data ?? [])
      : [];

    const eventPaths = visibleEvents.length
      ? ((await admin.from("event_photos").select("id, storage_path").in("id", visibleEvents).is("deleted_at", null))
          .data ?? [])
      : [];

    // 3. sign
    // one file can answer two asks (D-68: a gallery photo that is also the car's cover), so a path keeps a list
    type Target = { kind: "heroes" | "photos" | "listings" | "gallery" | "events"; id: string };
    const byPath = new Map<string, Target[]>();
    const add = (path: string, t: Target) => byPath.set(path, [...(byPath.get(path) ?? []), t]);
    for (const r of eventPaths) add(r.storage_path as string, { kind: "events", id: r.id as string });
    for (const r of heroPaths) if (r.hero_path) add(r.hero_path as string, { kind: "heroes", id: r.id as string });
    for (const r of photoPaths) add(r.storage_path as string, { kind: "photos", id: r.id as string });
    for (const r of galleryPaths) add(r.storage_path as string, { kind: "gallery", id: r.id as string });
    for (const r of listingPaths)
      if (r.photo_path) add(r.photo_path as string, { kind: "listings", id: r.id as string });
    const out: { heroes: Record<string, string>; photos: Record<string, string>; listings: Record<string, string>;
      gallery: Record<string, string>; events: Record<string, string>;
    } = {
      heroes: {},
      photos: {},
      listings: {},
      gallery: {},
      events: {},
    };
    if (byPath.size) {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrls([...byPath.keys()], TTL_SECONDS);
      if (error) throw error;
      for (const s of data ?? []) {
        if (!s.path || !s.signedUrl) continue;
        for (const target of byPath.get(s.path) ?? []) out[target.kind][target.id] = s.signedUrl;
      }
    }
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
});
