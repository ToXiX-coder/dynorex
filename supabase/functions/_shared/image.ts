// Image inspection shared by the register-photo Edge Function (Deno) and the app's tests (Node).
// Pure TypeScript, no imports. Looks at bytes only, never at file names or declared types.
//
// Checks: real JPEG/PNG/WebP by magic bytes; dimensions read from the file header; and whether any
// metadata block that can carry location or device data is present (JPEG APP1 Exif/XMP, PNG eXIf/
// tEXt/iTXt/zTXt, WebP EXIF/XMP chunks). The app strips metadata by re-encoding before upload; the
// server refuses anything that still has it.

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface ImageInfo {
  mime: ImageMime;
  width: number | null;
  height: number | null;
  hasMetadata: boolean;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8000;

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));
const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32le = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;

function jpeg(b: Uint8Array): ImageInfo {
  let width: number | null = null;
  let height: number | null = null;
  let hasMetadata = false;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1]!;
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    const len = u16be(b, i + 2);
    if (len < 2) break;
    if (marker === 0xe1) {
      const id = ascii(b, i + 4, 29);
      if (id.startsWith("Exif") || id.startsWith("http://ns.adobe.com/xap/1.0/")) hasMetadata = true;
    }
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = u16be(b, i + 5);
      width = u16be(b, i + 7);
    }
    i += 2 + len;
  }
  return { mime: "image/jpeg", width, height, hasMetadata };
}

function png(b: Uint8Array): ImageInfo {
  let width: number | null = null;
  let height: number | null = null;
  let hasMetadata = false;
  let i = 8;
  while (i + 8 <= b.length) {
    const len = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    if (type === "IHDR") {
      width = u32be(b, i + 8);
      height = u32be(b, i + 12);
    }
    if (["eXIf", "tEXt", "iTXt", "zTXt"].includes(type)) hasMetadata = true;
    if (type === "IEND") break;
    i += 12 + len;
  }
  return { mime: "image/png", width, height, hasMetadata };
}

function webp(b: Uint8Array): ImageInfo {
  let width: number | null = null;
  let height: number | null = null;
  let hasMetadata = false;
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = u32le(b, i + 4);
    const d = i + 8;
    if (type === "VP8X") {
      width = u24le(b, d + 4) + 1;
      height = u24le(b, d + 7) + 1;
    } else if (type === "VP8 " && width === null) {
      width = (b[d + 6]! | (b[d + 7]! << 8)) & 0x3fff;
      height = (b[d + 8]! | (b[d + 9]! << 8)) & 0x3fff;
    } else if (type === "VP8L" && width === null) {
      const bits = u32le(b, d + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    if (type === "EXIF" || type === "XMP ") hasMetadata = true;
    i = d + len + (len % 2);
  }
  return { mime: "image/webp", width, height, hasMetadata };
}

/** null when the bytes are not a JPEG, PNG or WebP image. */
export function inspectImage(b: Uint8Array): ImageInfo | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpeg(b);
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a) return png(b);
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return webp(b);
  return null;
}

export type ImageProblem = "empty" | "too_large" | "not_an_image" | "type_mismatch" | "too_many_pixels" | "has_metadata";

/** The server's acceptance rule. extension must match the detected type. */
export function acceptImage(b: Uint8Array, extension: string): { ok: true; info: ImageInfo } | { ok: false; problem: ImageProblem } {
  if (b.length === 0) return { ok: false, problem: "empty" };
  if (b.length > MAX_IMAGE_BYTES) return { ok: false, problem: "too_large" };
  const info = inspectImage(b);
  if (!info) return { ok: false, problem: "not_an_image" };
  const expected = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[extension.toLowerCase()];
  if (expected !== info.mime) return { ok: false, problem: "type_mismatch" };
  if ((info.width ?? 0) > MAX_IMAGE_SIDE || (info.height ?? 0) > MAX_IMAGE_SIDE) return { ok: false, problem: "too_many_pixels" };
  if (info.hasMetadata) return { ok: false, problem: "has_metadata" };
  return { ok: true, info };
}
