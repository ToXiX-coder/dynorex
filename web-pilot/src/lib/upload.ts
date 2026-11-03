import { AppError } from "./security";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_RECORD = 5;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const ACCEPT_ATTR =
  ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";

export interface IncomingFile {
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}

/** Look at the first bytes, not the file name or the browser's claim. */
function sniff(b: Uint8Array): (typeof ALLOWED_MIME)[number] | null {
  const starts = (sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export function safeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^\w .()-]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(-80);
  return cleaned || "file";
}

export function validateUpload(
  f: IncomingFile,
  imageOnly = false,
): { mime: string; displayName: string } {
  const fail = (m: string) => {
    throw new AppError("invalid", `${safeDisplayName(f.name)}: ${m}`, [
      { path: "files", message: m },
    ]);
  };
  if (f.size === 0) fail("The file is empty.");
  if (f.size > MAX_UPLOAD_BYTES)
    fail(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const mime = sniff(f.bytes);
  if (!mime) fail("Only JPG, PNG, WebP or PDF files are allowed.");
  if (f.type && f.type !== mime) fail("The file type does not match its contents.");
  if (imageOnly && mime === "application/pdf") fail("The vehicle photo must be an image.");
  return { mime: mime!, displayName: safeDisplayName(f.name) };
}
