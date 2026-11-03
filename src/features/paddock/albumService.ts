import { demoAlbumService } from "@/demo/upgrades";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { PublicEventPhoto } from "@/services/supabase/database.types";

/**
 * Meet photo albums (D-61). The host and people who went add photos (register-photo checks
 * who and when); everyone who can see the event sees the album, minus blocked people. The uploader or the host
 * can take a photo down.
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

const realAlbumService = {
  photos: (eventId: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_event_photos")
            .select("*")
            .eq("event_id", eventId)
            .order("created_at", { ascending: true })
            .limit(200),
        ) as PublicEventPhoto[],
    ),
  /** 5-minute signed URLs, checked by the server for this viewer (30 at a time). */
  urls: (photoIds: string[]) =>
    run(async () => {
      if (!photoIds.length) return {} as Record<string, string>;
      const { data, error } = await sb().functions.invoke<{ events?: Record<string, string> }>("public-media", {
        body: { events: photoIds.slice(0, 30) },
      });
      if (error) throw error;
      return data?.events ?? {};
    }),
  canAdd: (eventId: string) =>
    run(async () => Boolean(must(await sb().rpc("can_add_event_photo", { p_event: eventId })))),
  /** Ids of photos here you may take down: yours, or all of them if you host. */
  removable: (eventId: string) =>
    run(async () => (must(await sb().rpc("my_removable_event_photos", { p_event: eventId })) as string[]) ?? []),
  remove: (photoId: string) =>
    run(async () => {
      must(await sb().rpc("remove_event_photo", { p_photo: photoId }));
    }),
};

export type AlbumServiceApi = typeof realAlbumService;
export const albumService: AlbumServiceApi = config.demoMode ? demoAlbumService : realAlbumService;
