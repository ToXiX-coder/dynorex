import type { Visibility } from "./visibility";

/**
 * Ported from the web pilot (web-pilot/src/lib/publicView.ts). Public objects are BUILT from an
 * allow-list, never made by deleting fields from a private object, so a new private column can
 * never leak by default. The database views in supabase/migrations follow the same allow-list.
 */
export interface VehicleRow {
  id: string;
  owner_id: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  nickname: string | null;
  vin: string | null;
  odometer: number | null;
  description: string | null;
  hero_path: string | null;
  visibility: Visibility;
  deleted_at: string | null;
}

export interface PublicVehicleV1 {
  schema_version: 1;
  vehicle_id: string;
  owner: { username: string };
  year: number;
  make: string;
  model: string;
  trim: string | null;
  nickname: string | null;
  /** A short-lived signed reference produced after authorization. Never a raw storage path. */
  hero_media: string | null;
  visibility: "public";
}

/** Returns null when the vehicle must not be shown publicly. Callers render "not found". */
export function toPublicVehicle(
  v: VehicleRow,
  ownerUsername: string,
  signedHero: string | null,
): PublicVehicleV1 | null {
  if (v.visibility !== "public" || v.deleted_at !== null) return null;
  return {
    schema_version: 1,
    vehicle_id: v.id,
    owner: { username: ownerUsername },
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    nickname: v.nickname,
    hero_media: signedHero,
    visibility: "public",
  };
}

/** Keys that must never appear in any public projection. Used by tests and by a runtime guard. */
export const FORBIDDEN_PUBLIC_KEYS = [
  "vin",
  "owner_id",
  "email",
  "odometer",
  "cost_minor",
  "hero_path",
  "storage_path",
  "latitude",
  "longitude",
  "deleted_at",
] as const;

export function assertPublicSafe(obj: unknown): void {
  const json = JSON.stringify(obj);
  for (const k of FORBIDDEN_PUBLIC_KEYS) {
    if (json.includes(`"${k}"`)) throw new Error(`Public projection contains forbidden key: ${k}`);
  }
}
