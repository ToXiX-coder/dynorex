/**
 * Ported from the web pilot (web-pilot/src/lib/upload.ts). Upload checks look at file bytes,
 * never at the file name or the declared MIME type. The same rules run again in the upload
 * Edge Function (Phase 3); this copy gives fast feedback in the app.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // matches the "Keep it under 10MB" copy
export const MAX_PHOTOS_PER_MOD = 12;
export const MAX_DIMENSION_PX = 8000;
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export function sniffImage(b: Uint8Array): AllowedImageMime | null {
  const at = (sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);
  if (at([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  // ISO BMFF "ftyp" box with a HEIC/HEIF brand
  if (at([0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (["heic", "heix", "mif1", "msf1", "heif"].includes(brand)) return "image/heic";
  }
  return null;
}

export type UploadProblem = "empty" | "too_large" | "not_an_image" | "type_mismatch" | "too_many_pixels";

export function checkImage(input: {
  bytes: Uint8Array;
  size: number;
  declaredType?: string;
  width?: number;
  height?: number;
}): { ok: true; mime: AllowedImageMime } | { ok: false; problem: UploadProblem } {
  if (input.size <= 0) return { ok: false, problem: "empty" };
  if (input.size > MAX_PHOTO_BYTES) return { ok: false, problem: "too_large" };
  const mime = sniffImage(input.bytes);
  if (!mime) return { ok: false, problem: "not_an_image" };
  if (
    input.declaredType &&
    input.declaredType !== mime &&
    !(mime === "image/heic" && input.declaredType === "image/heif")
  ) {
    return { ok: false, problem: "type_mismatch" };
  }
  if ((input.width ?? 0) > MAX_DIMENSION_PX || (input.height ?? 0) > MAX_DIMENSION_PX) {
    return { ok: false, problem: "too_many_pixels" };
  }
  return { ok: true, mime };
}

/** Strip any path and odd characters from a display name. */
export function safeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "photo";
  return (
    base
      .replace(/[^\w .()-]/g, "_")
      .replace(/^\.+/, "")
      .trim()
      .slice(-80) || "photo"
  );
}
