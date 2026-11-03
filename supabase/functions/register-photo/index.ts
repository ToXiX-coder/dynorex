// POST /functions/v1/register-photo
// Body: { kind: "mod", modId, path, role: "before"|"after"|"gallery" } | { kind: "hero", vehicleId, path }
//       | { kind: "listing", listingId, path } (the Shop listing's one photo)
//       | { kind: "gallery", vehicleId, path } (a vehicle's photo gallery, up to 24)
//       | { kind: "receipt", vehicleId, path, modId? | maintenanceId? } (private, up to 4 per item; D-61)
//       | { kind: "event", eventId, path } (a meet's album: host and people who went, up to 10 each; D-61)
//       | { kind: "dyno", resultId, path } (a photo of the shop's dyno sheet for one result, private; D-63)
// The app has already uploaded the file to vehicle-media/<uid>/<uuid>.<ext> (storage policy enforces the
// folder). This function is the only way a photo becomes part of a build:
//   1. caller identity from their JWT; path must be inside their folder
//   2. ownership of the mod/vehicle checked AS the caller (RLS)
//   3. rate limit (20 photos / hour), per-mod cap (12)
//   4. file bytes checked: real JPEG/PNG/WebP, <= 10 MB, <= 8000 px, NO Exif/XMP/text metadata
//   5. row written with the service role; rejected files are deleted
// NOT YET RUN: needs Deno + Supabase.
import { adminClient, errorResponse, HttpError, userClient } from "../_shared/auth.ts";
import { acceptImage } from "../_shared/image.ts";

const BUCKET = "vehicle-media";
const MAX_PER_MOD = 12;
const MAX_GALLERY = 24;
const MAX_RECEIPTS = 4;
const MAX_EVENT_EACH = 10;
const MAX_EVENT_TOTAL = 200;

type Body =
  | { kind: "mod"; modId: string; path: string; role: "before" | "after" | "gallery" }
  | { kind: "hero"; vehicleId: string; path: string }
  | { kind: "listing"; listingId: string; path: string }
  | { kind: "gallery"; vehicleId: string; path: string }
  | { kind: "receipt"; vehicleId: string; path: string; modId?: string; maintenanceId?: string }
  | { kind: "event"; eventId: string; path: string }
  | { kind: "dyno"; resultId: string; path: string };

const UUID = /^[0-9a-f-]{36}$/;

/** D-64: a sold car, or an earlier owner's entry, is read-only (the database refuses the write). */
const readOnly = (e: { message?: string }) =>
  /vehicle_sold|inherited_entry/.test(e.message ?? "") ? new HttpError(403, "This car's record is read-only.") : e;

Deno.serve(async (req) => {
  const admin = adminClient();
  let pathToRemove: string | null = null;
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    const user = userClient(req);
    const { data: who, error } = await user.auth.getUser();
    if (error || !who.user) throw new HttpError(401, "You've been logged out");
    const uid = who.user.id;

    const body = (await req.json()) as Body;
    const m = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(String(body?.path ?? ""));
    if (!m || m[1] !== uid) throw new HttpError(400, "That photo didn't make it. Try again.");
    const ext = m[3]!;
    pathToRemove = body.path;

    // ownership, checked under RLS as the caller
    if (body.kind === "mod") {
      if (!UUID.test(body.modId) || !["before", "after", "gallery"].includes(body.role)) throw new HttpError(400, "That photo didn't make it. Try again.");
      const { data: mod } = await user.from("mods").select("id").eq("id", body.modId).maybeSingle();
      if (!mod) throw new HttpError(404, "Build not found");
      const { count } = await admin
        .from("mod_photos")
        .select("id", { count: "exact", head: true })
        .eq("mod_id", body.modId)
        .is("deleted_at", null);
      if ((count ?? 0) >= MAX_PER_MOD) throw new HttpError(400, `Up to ${MAX_PER_MOD} photos per mod.`);
    } else if (body.kind === "hero") {
      if (!UUID.test(body.vehicleId)) throw new HttpError(400, "That photo didn't make it. Try again.");
      const { data: v } = await user.from("vehicles").select("id").eq("id", body.vehicleId).maybeSingle();
      if (!v) throw new HttpError(404, "Build not found");
    } else if (body.kind === "gallery") {
      if (!UUID.test(body.vehicleId)) throw new HttpError(400, "That photo didn't make it. Try again.");
      const { data: v } = await user.from("vehicles").select("id").eq("id", body.vehicleId).maybeSingle();
      if (!v) throw new HttpError(404, "Build not found");
      const { count } = await admin
        .from("vehicle_photos")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", body.vehicleId)
        .is("deleted_at", null);
      if ((count ?? 0) >= MAX_GALLERY) throw new HttpError(400, `Up to ${MAX_GALLERY} photos per car.`);
    } else if (body.kind === "receipt") {
      // exactly one item, and it must be on this car and yours (both checked under RLS as the caller)
      const item = body.modId ?? body.maintenanceId;
      if (!UUID.test(body.vehicleId) || !item || !UUID.test(item) || (body.modId && body.maintenanceId))
        throw new HttpError(400, "That photo didn't make it. Try again.");
      const table = body.modId ? "mods" : "maintenance_records";
      const { data: row } = await user.from(table).select("id").eq("id", item).eq("vehicle_id", body.vehicleId).maybeSingle();
      if (!row) throw new HttpError(404, "Build not found");
      const { count } = await admin
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .eq(body.modId ? "mod_id" : "maintenance_id", item)
        .is("deleted_at", null);
      if ((count ?? 0) >= MAX_RECEIPTS) throw new HttpError(400, `Up to ${MAX_RECEIPTS} receipts each.`);
    } else if (body.kind === "event") {
      if (!UUID.test(body.eventId)) throw new HttpError(400, "That photo didn't make it. Try again.");
      // host or went, while the album is open: asked AS THE CALLER
      const { data: ok } = await user.rpc("can_add_event_photo", { p_event: body.eventId });
      if (ok !== true) throw new HttpError(403, "Only people who went can add photos, up to a week after.");
      const mine = await admin
        .from("event_photos")
        .select("id", { count: "exact", head: true })
        .eq("event_id", body.eventId)
        .eq("owner_id", uid)
        .is("deleted_at", null);
      if ((mine.count ?? 0) >= MAX_EVENT_EACH) throw new HttpError(400, `Up to ${MAX_EVENT_EACH} photos each.`);
      const all = await admin
        .from("event_photos")
        .select("id", { count: "exact", head: true })
        .eq("event_id", body.eventId)
        .is("deleted_at", null);
      if ((all.count ?? 0) >= MAX_EVENT_TOTAL) throw new HttpError(400, "This album is full.");
    } else if (body.kind === "dyno") {
      if (!UUID.test(body.resultId)) throw new HttpError(400, "That photo didn't make it. Try again.");
      const { data: d } = await user.from("dyno_results").select("id").eq("id", body.resultId).maybeSingle();
      if (!d) throw new HttpError(404, "Build not found");
    } else if (body.kind === "listing") {
      if (!UUID.test(body.listingId)) throw new HttpError(400, "That photo didn't make it. Try again.");
      const { data: l } = await user.from("listings").select("id").eq("id", body.listingId).maybeSingle();
      if (!l) throw new HttpError(404, "Build not found");
    } else {
      throw new HttpError(400, "That photo didn't make it. Try again.");
    }

    const { error: rl } = await admin.rpc("enforce_rate_limit_for", {
      p_user: uid,
      p_action: "photo_upload",
      p_max: 20,
      p_window_seconds: 3600,
    });
    if (rl) throw new HttpError(429, "You're moving fast. Wait a minute and try again.", 3600);

    // the bytes themselves
    const { data: blob, error: dl } = await admin.storage.from(BUCKET).download(body.path);
    if (dl || !blob) throw new HttpError(400, "That photo didn't make it. Try again.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const verdict = acceptImage(bytes, ext);
    if (!verdict.ok) {
      const msg = verdict.problem === "too_large" ? "Keep it under 10MB and try again." : "That photo didn't make it. Try again.";
      throw new HttpError(400, msg);
    }

    if (body.kind === "mod") {
      const { count } = await admin
        .from("mod_photos")
        .select("id", { count: "exact", head: true })
        .eq("mod_id", body.modId)
        .is("deleted_at", null);
      const { data: row, error: ins } = await admin
        .from("mod_photos")
        .insert({
          owner_id: uid,
          mod_id: body.modId,
          storage_path: body.path,
          role: body.role,
          position: count ?? 0,
          mime: verdict.info.mime,
          bytes: bytes.length,
          width: verdict.info.width,
          height: verdict.info.height,
        })
        .select("id, role, position")
        .single();
      if (ins) throw ins;
      pathToRemove = null;
      return json({ photo: row });
    }

    if (body.kind === "gallery") {
      const { count } = await admin
        .from("vehicle_photos")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", body.vehicleId)
        .is("deleted_at", null);
      const { data: row, error: ins } = await admin
        .from("vehicle_photos")
        .insert({
          owner_id: uid,
          vehicle_id: body.vehicleId,
          storage_path: body.path,
          position: count ?? 0,
          mime: verdict.info.mime,
          bytes: bytes.length,
          width: verdict.info.width,
          height: verdict.info.height,
        })
        .select("id, position")
        .single();
      if (ins) throw ins;
      pathToRemove = null;
      return json({ photo: row });
    }

    if (body.kind === "receipt") {
      // D-64: the file's fingerprint goes on the Build Record, so a swapped receipt would show
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
      const { data: row, error: ins } = await admin
        .from("receipts")
        .insert({
          owner_id: uid,
          vehicle_id: body.vehicleId,
          mod_id: body.modId ?? null,
          maintenance_id: body.maintenanceId ?? null,
          storage_path: body.path,
          mime: verdict.info.mime,
          bytes: bytes.length,
          width: verdict.info.width,
          height: verdict.info.height,
          sha256,
        })
        .select("id")
        .single();
      if (ins) throw readOnly(ins);
      pathToRemove = null;
      return json({ receipt: row });
    }

    if (body.kind === "event") {
      const { data: row, error: ins } = await admin
        .from("event_photos")
        .insert({
          event_id: body.eventId,
          owner_id: uid,
          storage_path: body.path,
          mime: verdict.info.mime,
          bytes: bytes.length,
          width: verdict.info.width,
          height: verdict.info.height,
        })
        .select("id")
        .single();
      if (ins) throw ins;
      pathToRemove = null;
      return json({ photo: row });
    }

    if (body.kind === "dyno") {
      // one sheet per result: swap in the new file, then remove the old one
      const { data: old } = await admin.from("dyno_results").select("sheet_path").eq("id", body.resultId).eq("owner_id", uid).single();
      const { error: upd } = await admin.from("dyno_results").update({ sheet_path: body.path }).eq("id", body.resultId).eq("owner_id", uid);
      if (upd) throw readOnly(upd);
      pathToRemove = null;
      if (old?.sheet_path && old.sheet_path !== body.path) await admin.storage.from(BUCKET).remove([old.sheet_path]);
      return json({ sheet_path: body.path });
    }

    if (body.kind === "listing") {
      const { data: old } = await admin.from("listings").select("photo_path").eq("id", body.listingId).eq("seller_id", uid).single();
      const { error: upd } = await admin
        .from("listings")
        .update({ photo_path: body.path })
        .eq("id", body.listingId)
        .eq("seller_id", uid);
      if (upd) throw upd;
      pathToRemove = null;
      if (old?.photo_path && old.photo_path !== body.path) await admin.storage.from(BUCKET).remove([old.photo_path]);
      return json({ photo_path: body.path });
    }

    // hero: swap in the new file, then remove the old one
    const { data: old } = await admin.from("vehicles").select("hero_path").eq("id", body.vehicleId).eq("owner_id", uid).single();
    const { error: upd } = await admin
      .from("vehicles")
      .update({ hero_path: body.path })
      .eq("id", body.vehicleId)
      .eq("owner_id", uid);
    if (upd) throw upd;
    pathToRemove = null;
    if (old?.hero_path && old.hero_path !== body.path) {
      // D-68: the old cover may be one of the car's gallery photos (set_cover_photo); that file stays
      const { count } = await admin
        .from("vehicle_photos")
        .select("id", { count: "exact", head: true })
        .eq("storage_path", old.hero_path);
      if (!count) await admin.storage.from(BUCKET).remove([old.hero_path]);
    }
    return json({ hero_path: body.path });
  } catch (e) {
    // never keep a file that didn't pass every check
    if (pathToRemove) await admin.storage.from(BUCKET).remove([pathToRemove]).catch(() => {});
    return errorResponse(e);
  }
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
