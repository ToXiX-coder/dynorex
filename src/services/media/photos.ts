import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { sampleUri } from "@/demo/sampleMedia";
import { demoRegisterPhotoResult } from "@/demo/services";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";

/**
 * Photo pipeline: pick -> resize + re-encode on the phone (drops EXIF/GPS) -> upload with progress into
 * the owner's private folder -> register-photo Edge Function checks the bytes and records it.
 * Nothing is "saved" until the server says so.
 */
export const BUCKET = "vehicle-media";
const MAX_SIDE = 2048;
const QUALITY = 0.8;

export type PhotoSource = "camera" | "library";
export type Result<T> = { ok: true; data: T } | { ok: false; error: MappedError };

export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
  source: PhotoSource;
}

/** Ask permission, open camera/library. Returns null if the person cancels. */
export async function pickPhoto(source: PhotoSource): Promise<Result<PreparedPhoto | null>> {
  try {
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { ok: false, error: { key: "photoRejected" } };
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 1,
      exif: false,
      allowsEditing: false,
    };
    const picked =
      source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (picked.canceled || !picked.assets[0]) return { ok: true, data: null };
    const a = picked.assets[0];
    return { ok: true, data: await prepare(a.uri, a.width, a.height, source) };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}

/** Resize so the long side is at most 2048 px and re-encode as JPEG. Re-encoding writes a new file with no EXIF. */
async function prepare(uri: string, width: number, height: number, source: PhotoSource): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height, source };
}

export interface UploadHandle {
  promise: Promise<Result<{ path: string }>>;
  cancel: () => Promise<void>;
}

/** Upload with a progress callback (0..1). Runs off the UI thread; the screen stays usable. */
export function uploadPhoto(photo: PreparedPhoto, onProgress: (p: number) => void): UploadHandle {
  if (config.demoMode) return demoUpload(photo, onProgress);
  let task: FileSystem.UploadTask | null = null;
  let cancelled = false;
  const promise = (async (): Promise<Result<{ path: string }>> => {
    try {
      const sb = getSupabase();
      if (!sb || !config.supabaseUrl || !config.supabaseAnonKey) throw new Error("not_configured");
      const { data } = await sb.auth.getSession();
      const session = data.session;
      if (!session) throw { code: "session_not_found" };
      const path = `${session.user.id}/${Crypto.randomUUID()}.jpg`;
      task = FileSystem.createUploadTask(
        `${config.supabaseUrl}/storage/v1/object/${BUCKET}/${path}`,
        photo.uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: config.supabaseAnonKey,
            "Content-Type": "image/jpeg",
            "x-upsert": "false",
          },
        },
        (p) => onProgress(p.totalBytesExpectedToSend > 0 ? p.totalBytesSent / p.totalBytesExpectedToSend : 0),
      );
      const res = await task.uploadAsync();
      if (cancelled) return { ok: false, error: { key: "uploadFailed", cancelled: true } };
      if (!res) throw new Error("upload_failed");
      if (res.status === 413) return { ok: false, error: { key: "photoTooLarge" } };
      if (res.status === 429) return { ok: false, error: { key: "rateLimited" } };
      if (res.status >= 400) return { ok: false, error: { key: "uploadFailed" } };
      onProgress(1);
      return { ok: true, data: { path } };
    } catch (e) {
      if (cancelled) return { ok: false, error: { key: "uploadFailed", cancelled: true } };
      const m = mapError(e);
      return { ok: false, error: m.key === "server" ? { key: "uploadFailed" } : m };
    }
  })();
  return {
    promise,
    cancel: async () => {
      cancelled = true;
      await task?.cancelAsync().catch(() => {});
    },
  };
}

/** Pitch mode: no upload. Shows a short progress run so the flow can be demonstrated, keeps the local file. */
function demoUpload(photo: PreparedPhoto, onProgress: (p: number) => void): UploadHandle {
  let cancelled = false;
  const promise = (async (): Promise<Result<{ path: string }>> => {
    for (const p of [0.2, 0.5, 0.8, 1]) {
      await new Promise((r) => setTimeout(r, 150));
      if (cancelled) return { ok: false, error: { key: "uploadFailed", cancelled: true } };
      onProgress(p);
    }
    return { ok: true, data: { path: photo.uri } };
  })();
  return {
    promise,
    cancel: async () => {
      cancelled = true;
    },
  };
}

/** What a photo is for. register-photo checks each kind (see that function's header). */
export type PhotoTarget =
  | { kind: "mod"; modId: string; role: "before" | "after" | "gallery" }
  | { kind: "hero"; vehicleId: string }
  | { kind: "listing"; listingId: string }
  | { kind: "gallery"; vehicleId: string }
  // D-61: a private receipt on one mod or one maintenance record, and a meet's photo album
  | { kind: "receipt"; vehicleId: string; modId?: string; maintenanceId?: string }
  | { kind: "event"; eventId: string }
  // D-63: a photo of the shop's dyno sheet for one result (private; the public number shows "sheet on file")
  | { kind: "dyno"; resultId: string };
type Register = PhotoTarget & { path: string };

/** The server check. Until this succeeds the photo is not part of the build. */
export async function registerPhoto(body: Register): Promise<Result<void>> {
  if (config.demoMode) {
    const refused = demoRegisterPhotoResult(body);
    return refused ? { ok: false, error: { key: refused } } : { ok: true, data: undefined };
  }
  try {
    const sb = getSupabase();
    if (!sb) throw new Error("not_configured");
    const { error } = await sb.functions.invoke("register-photo", { method: "POST", body });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 429) return { ok: false, error: { key: "rateLimited" } };
      if (status === 400) return { ok: false, error: { key: "photoRejected" } };
      // event albums: not the host or someone who went, or outside the album's window
      if (status === 403) return { ok: false, error: { key: "eventPhotoClosed" } };
      throw error;
    }
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}

/** Short-lived signed URL (5 minutes) for the owner's own private photo. */
export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (config.demoMode) return sampleUri(path); // pitch mode: the "path" is the photo's local file or a sample
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
