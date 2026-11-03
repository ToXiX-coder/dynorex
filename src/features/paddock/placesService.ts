import {
  parseRetrieve,
  parseSuggestions,
  retrieveUrl,
  SAMPLE_PLACE_COORDS,
  sampleSuggestions,
  suggestUrl,
  type Near,
  type PlaceSuggestion,
} from "@/domain/places";
import { config } from "@/services/config";

export type PlacesResult =
  { ok: true; places: PlaceSuggestion[] } | { ok: false; reason: "not_connected" | "offline" | "failed" };

/**
 * Meeting-place search. Real builds call Mapbox's Search Box /suggest with the PUBLIC pk token (no Dynorex
 * server involved); without a token it says so instead of pretending. Pitch mode answers from sample places.
 */
export const placesService = {
  available: () => config.demoMode || Boolean(config.mapboxToken),

  suggest: async (q: string, session: string, near: Near | null, signal?: AbortSignal): Promise<PlacesResult> => {
    if (config.demoMode) return { ok: true, places: sampleSuggestions(q) };
    if (!config.mapboxToken) return { ok: false, reason: "not_connected" };
    try {
      const res = await fetch(suggestUrl(q, config.mapboxToken, session, near), { signal });
      if (!res.ok) return { ok: false, reason: "failed" };
      return { ok: true, places: parseSuggestions(await res.json()) };
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return { ok: true, places: [] };
      return { ok: false, reason: "offline" };
    }
  },

  /** The picked place's coordinates, or null (no token, offline, or Mapbox didn't say). Never throws. */
  retrieve: async (id: string, session: string): Promise<Near | null> => {
    if (config.demoMode) return SAMPLE_PLACE_COORDS[id] ?? null;
    if (!config.mapboxToken) return null;
    try {
      const res = await fetch(retrieveUrl(id, config.mapboxToken, session));
      return res.ok ? parseRetrieve(await res.json()) : null;
    } catch {
      return null;
    }
  },
};
