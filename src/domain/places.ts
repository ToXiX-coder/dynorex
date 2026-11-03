/**
 * Meeting-place suggestions (Mapbox Search Box API, /suggest only). The host's location, if they share it,
 * only ranks nearby places first: it's rounded to about 1 km on the phone, sent to Mapbox with the search,
 * and never saved by Dynorex. Only the picked place's name and address go into the event.
 */

export type PlaceSuggestion = {
  id: string;
  name: string;
  /** "123 Main St, Sample City" or "Sample City, CA" */
  detail: string;
  kind: "poi" | "address" | "street" | "place" | "other";
};

export type Near = { lat: number; lng: number };

/** ~1.1 km precision: enough to rank nearby places, too coarse to pinpoint a home. */
export const roundNear = (p: Near): Near => ({
  lat: Math.round(p.lat * 100) / 100,
  lng: Math.round(p.lng * 100) / 100,
});

export function suggestUrl(q: string, token: string, session: string, near: Near | null): string {
  const params = new URLSearchParams({
    q: q.trim().slice(0, 256),
    access_token: token,
    session_token: session,
    limit: "6",
    language: "en",
    types: "poi,address,street,place",
  });
  if (near) {
    const r = roundNear(near);
    params.set("proximity", `${r.lng},${r.lat}`);
  }
  return `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`;
}

const KINDS = new Set(["poi", "address", "street", "place"]);

/** Defensive parse of the /suggest response; anything malformed is skipped, never shown. */
export function parseSuggestions(json: unknown): PlaceSuggestion[] {
  const list = (json as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  const out: PlaceSuggestion[] = [];
  for (const s of list as Record<string, unknown>[]) {
    const name = typeof s?.name === "string" ? s.name.trim() : "";
    const id = typeof s?.mapbox_id === "string" ? s.mapbox_id : "";
    if (!name || !id) continue;
    const detail =
      (typeof s.place_formatted === "string" && s.place_formatted) ||
      (typeof s.full_address === "string" && s.full_address) ||
      "";
    const ft = typeof s.feature_type === "string" ? s.feature_type : "";
    out.push({
      id,
      name: name.slice(0, 100),
      detail: String(detail).slice(0, 140),
      kind: (KINDS.has(ft) ? ft : "other") as PlaceSuggestion["kind"],
    });
  }
  return out;
}

/** Search Box /retrieve: the picked suggestion's coordinates (same session token as the suggestions). */
export function retrieveUrl(id: string, token: string, session: string): string {
  const params = new URLSearchParams({ access_token: token, session_token: session });
  return `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(id)}?${params.toString()}`;
}

/** Defensive parse of /retrieve: the first feature's [lng, lat], or null. */
export function parseRetrieve(json: unknown): Near | null {
  const f = (json as { features?: { geometry?: { coordinates?: unknown } }[] })?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const [lng, lat] = c as number[];
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}

/** What goes in the event's meeting place (max 120 characters, like the field). */
export function placeText(s: PlaceSuggestion): string {
  const t = s.detail && !s.detail.startsWith(s.name) ? `${s.name}, ${s.detail}` : s.detail || s.name;
  return t.slice(0, 120);
}

/** A bare street address could be someone's home: the form reminds the host to pick a public spot. */
export const looksLikeStreetAddress = (s: PlaceSuggestion) => s.kind === "address";

// ---------------------------------------------------------------- pitch mode

/** Made-up coordinates for the sample places, around the same fictional city centre as the sample events. */
export const SAMPLE_PLACE_COORDS: Record<string, Near> = {
  "demo-1": { lat: 34.052, lng: -118.243 },
  "demo-2": { lat: 34.071, lng: -118.262 },
  "demo-3": { lat: 34.094, lng: -118.301 },
  "demo-4": { lat: 34.021, lng: -118.215 },
  "demo-5": { lat: 34.035, lng: -118.282 },
  "demo-6": { lat: 34.058, lng: -118.236 },
};

/** Sample places for pitch mode (no network). Fictional, like the rest of the sample data. */
export const SAMPLE_PLACES: PlaceSuggestion[] = [
  { id: "demo-1", name: "Sample Mall, level 3 car park", detail: "Sample City", kind: "poi" },
  { id: "demo-2", name: "Sample City Cars & Coffee lot", detail: "North Ave, Sample City", kind: "poi" },
  { id: "demo-3", name: "Ridge Road scenic overlook", detail: "Ridge Rd, Sample County", kind: "poi" },
  { id: "demo-4", name: "Sample Raceway paddock", detail: "Speedway Blvd, Sample City", kind: "poi" },
  { id: "demo-5", name: "Harbor Park north lot", detail: "Harbor Dr, Sample City", kind: "poi" },
  { id: "demo-6", name: "Night Owl Coffee", detail: "Main St, Sample City", kind: "poi" },
  { id: "demo-7", name: "Grand Hardware & Auto car park", detail: "Route 9, Sample City", kind: "poi" },
  { id: "demo-8", name: "123 Main St", detail: "Sample City", kind: "address" },
];

export function sampleSuggestions(q: string): PlaceSuggestion[] {
  const n = q.trim().toLowerCase();
  if (n.length < 2) return [];
  const words = n.split(/\s+/);
  return SAMPLE_PLACES.filter((p) => words.every((w) => `${p.name} ${p.detail}`.toLowerCase().includes(w))).slice(0, 6);
}
