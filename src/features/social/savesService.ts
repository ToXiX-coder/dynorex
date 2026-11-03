import { demoSavesService } from "@/demo/extras";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { SaveKind, SaveRow } from "@/services/supabase/database.types";

/** Saved items (private bookmarks) and public badges. Saves are your own rows only (row-level security). */
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

const realSavesService = {
  list: () =>
    run(
      async () =>
        must(await sb().from("saves").select("*").order("created_at", { ascending: false }).limit(1000)) as SaveRow[],
    ),
  isSaved: (kind: SaveKind, id: string) =>
    run(
      async () =>
        (must(await sb().from("saves").select("kind").eq("kind", kind).eq("target_id", id)) as unknown[]).length > 0,
    ),
  save: (kind: SaveKind, id: string) =>
    run(async () => {
      const { error } = await sb().from("saves").insert({ kind, target_id: id });
      // already saved is fine
      if (error && (error as { code?: string }).code !== "23505") throw error;
    }),
  unsave: (kind: SaveKind, id: string) =>
    run(async () => {
      must(await sb().from("saves").delete().eq("kind", kind).eq("target_id", id));
    }),
  achievements: (username: string) =>
    run(async () =>
      (must(await sb().rpc("achievements", { p_username: username })) as { id: string }[]).map((r) => r.id),
    ),
};

export type SavesServiceApi = typeof realSavesService;
export const savesService: SavesServiceApi = config.demoMode ? demoSavesService : realSavesService;
