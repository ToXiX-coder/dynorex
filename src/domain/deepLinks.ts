/**
 * Stable public URLs (handoff spec "Deep Link URL Schema") and the small pure rules around them.
 * The server decides what is visible; these helpers only build and validate paths, so a malformed
 * notification payload or link can never route somewhere unexpected.
 */
export const PUBLIC_ORIGIN = "https://dynorex.app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USERNAME = /^[a-z0-9_]{3,20}$/;

export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
export const isUsername = (s: unknown): s is string => typeof s === "string" && USERNAME.test(s);

export const userPath = (username: string) => `/u/${username}` as const;
export const buildPath = (vehicleId: string) => `/build/${vehicleId}` as const;
export const modPath = (vehicleId: string, modId: string) => `/build/${vehicleId}/mod/${modId}` as const;
export const shareUrl = (path: string) => `${PUBLIC_ORIGIN}${path}`;

/** Routes anyone may open without an account (they still only show public data). */
export function isPublicPath(path: string): boolean {
  const p =
    path
      .replace(/^https?:\/\/[^/]+/i, "")
      .split(/[?#]/)[0]!
      .replace(/\/+$/, "") || "/";
  return (
    p === "/discover" ||
    p === "/discover/botw" ||
    p === "/support" ||
    p === "/account-deletion" ||
    /^\/u\/[a-z0-9_]{3,20}$/i.test(p) ||
    /^\/v\/[0-9a-f-]{36}$/i.test(p) ||
    /^\/route\/[0-9a-f-]{36}$/i.test(p) ||
    /^\/events\/[0-9a-f-]{36}$/i.test(p) ||
    /^\/clubs\/[0-9a-f-]{36}$/i.test(p) ||
    /^\/posts\/[0-9a-f-]{36}$/i.test(p) ||
    /^\/history\/[0-9a-f]{64}$/i.test(p) ||
    // D-64: a shop's one-time link to confirm a job
    /^\/confirm\/[0-9a-f]{64}$/i.test(p) ||
    /^\/build\/[0-9a-f-]{36}(\/mods)?$/i.test(p) ||
    /^\/build\/[0-9a-f-]{36}\/mod\/[0-9a-f-]{36}$/i.test(p)
  );
}

/**
 * Where a notification tap goes. Payload shape: { entity_type, entity_id, category }.
 * Anything unexpected returns null and the app opens the inbox instead.
 */
export function notificationHref(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { entity_type: type, entity_id: id, category } = data as Record<string, unknown>;
  // D-64: a shop is asked to confirm a job (its inbox), and a car owner hears back (the car's Build Record)
  if (category === "record_confirm_request") return "/paddock/business";
  if (category === "record_confirm_answer") return isUuid(id) ? `/garage/${id}/record` : null;
  switch (type) {
    case "user":
      return isUsername(id) ? userPath(id) : null;
    case "build":
      return isUuid(id) ? buildPath(id) : null;
    case "subscription":
      return "/settings/subscription";
    case "botw":
      return "/discover/botw";
    case "event":
      return isUuid(id) ? `/events/${id}` : null;
    case "listing":
      return isUuid(id) ? `/listings/${id}` : null;
    case "maintenance":
      return isUuid(id) ? `/garage/${id}/maintenance` : null;
    case "business":
      return isUuid(id) ? `/business/${id}` : null;
    case "service_request":
      return isUuid(id) ? `/requests/${id}` : null;
    case "post":
      return isUuid(id) ? `/posts/${id}` : null;
    // a recall alert opens your own car (its Recalls card)
    case "vehicle":
      return isUuid(id) ? `/garage/${id}` : null;
    default:
      return null;
  }
}

/**
 * Nearby uses a coarse 0.5-degree grid (about 55 km). The position is rounded ON THE DEVICE and only
 * these two integers are sent. Must match the ranges checked in the database.
 */
export const REGION_CELL_DEGREES = 0.5;
export function regionCell(lat: number, lon: number): { cell_lat: number; cell_lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const cell_lat = Math.min(179, Math.max(-180, Math.floor(lat / REGION_CELL_DEGREES)));
  const cell_lon = Math.min(359, Math.max(-360, Math.floor(lon / REGION_CELL_DEGREES)));
  return { cell_lat, cell_lon };
}

/** Same reduction the server applies: up to 5 lowercase alphanumeric words. Search starts at 2 chars. */
export function searchTerms(q: string): { words: string[]; ready: boolean } {
  const words = (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 5).map((w) => w.slice(0, 30));
  return { words, ready: words.join(" ").length >= 2 };
}
