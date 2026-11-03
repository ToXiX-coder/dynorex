/**
 * NHTSA vPIC lookup (https://vpic.nhtsa.dot.gov/api/), the only vehicle-data provider used.
 * Suggestions only: people can always type any make/model by hand, and nothing waits on NHTSA.
 * The make and model lists send only year and make. The VIN goes to NHTSA only when the owner taps "Fill in from
 * VIN" (D-68), straight from the phone to NHTSA's public decoder; Dynorex's servers never send it anywhere.
 */
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const TIMEOUT_MS = 8000;

export interface NhtsaMake {
  id: number;
  name: string;
}
export interface NhtsaModel {
  id: number;
  name: string;
}

export type Lookup<T> = { ok: true; items: T[] } | { ok: false; reason: "offline" | "unavailable" };

const memo = new Map<string, unknown[]>();

async function getJson(url: string): Promise<{ Results?: Record<string, unknown>[] }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as { Results?: Record<string, unknown>[] };
  } finally {
    clearTimeout(t);
  }
}

async function cached<T>(key: string, load: () => Promise<T[]>): Promise<Lookup<T>> {
  const hit = memo.get(key) as T[] | undefined;
  if (hit) return { ok: true, items: hit };
  try {
    const items = await load();
    memo.set(key, items);
    return { ok: true, items };
  } catch (e) {
    const msg = String((e as Error)?.message ?? "");
    return { ok: false, reason: /network|fetch|abort/i.test(msg) ? "offline" : "unavailable" };
  }
}

const title = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bBmw\b/, "BMW");

export const nhtsa = {
  /** Car and truck makes (passenger vehicles), alphabetical. */
  makes: () =>
    cached<NhtsaMake>("makes", async () => {
      const [cars, trucks] = await Promise.all([
        getJson(`${BASE}/GetMakesForVehicleType/car?format=json`),
        getJson(`${BASE}/GetMakesForVehicleType/truck?format=json`),
      ]);
      const seen = new Map<number, NhtsaMake>();
      for (const r of [...(cars.Results ?? []), ...(trucks.Results ?? [])]) {
        const id = Number(r.MakeId);
        const name = String(r.MakeName ?? "").trim();
        if (id && name) seen.set(id, { id, name: title(name) });
      }
      return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }),

  models: (makeId: number, year: number) =>
    cached<NhtsaModel>(`models:${makeId}:${year}`, async () => {
      if (!Number.isInteger(makeId) || !Number.isInteger(year)) return [];
      const r = await getJson(`${BASE}/GetModelsForMakeIdYear/makeId/${makeId}/modelyear/${year}?format=json`);
      const out = new Map<number, NhtsaModel>();
      for (const m of r.Results ?? []) {
        const id = Number(m.Model_ID);
        const name = String(m.Model_Name ?? "").trim();
        if (id && name) out.set(id, { id, name });
      }
      return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
    }),

  /**
   * Models by make name, for a make typed or picked from the popular list (no NHTSA id needed). D-71: a vehicle type
   * ("motorcycle") narrows it, so a Honda motorcycle doesn't list Civics.
   */
  modelsByName: (make: string, year: number, vehicleType?: "motorcycle") =>
    cached<NhtsaModel>(`modelsByName:${make.trim().toLowerCase()}:${year}:${vehicleType ?? ""}`, async () => {
      if (!make.trim() || !Number.isInteger(year)) return [];
      const type = vehicleType ? `/vehicletype/${vehicleType}` : "";
      const r = await getJson(
        `${BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make.trim())}/modelyear/${year}${type}?format=json`,
      );
      const out = new Map<number, NhtsaModel>();
      for (const m of r.Results ?? []) {
        const id = Number(m.Model_ID);
        const name = String(m.Model_Name ?? "").trim();
        if (id && name) out.set(id, { id, name });
      }
      return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
    }),
};

export type DecodedVin = { year: number; make: string; model: string; trim: string | null };

/** The parts of NHTSA's DecodeVinValues answer the form uses, or null when it didn't name a year, make and model. */
export function readDecodedVin(row: Record<string, unknown> | undefined): DecodedVin | null {
  const s = (k: string) => String(row?.[k] ?? "").trim();
  const year = Number(s("ModelYear"));
  if (!Number.isInteger(year) || year < 1886 || !s("Make") || !s("Model")) return null;
  return {
    year,
    make: title(s("Make")),
    model: s("Model"),
    // only the real trim name: "Series" is often a factory code (e.g. "KA") that would read as nonsense
    trim: s("Trim") || null,
  };
}

/**
 * D-68: year, make, model and trim from a VIN, on the owner's tap only. Not cached, so the VIN isn't kept in
 * memory past the answer. Errors read as "couldn't decode" and the owner types the car in as before.
 */
export async function decodeVin(vin: string): Promise<{ ok: true; car: DecodedVin | null } | { ok: false }> {
  try {
    const r = await getJson(`${BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
    return { ok: true, car: readDecodedVin(r.Results?.[0]) };
  } catch {
    return { ok: false };
  }
}

/** Up to `limit` items whose name starts with, then contains, the query (case-insensitive). */
export function filterByName<T extends { name: string }>(items: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = items.filter((i) => i.name.toLowerCase().startsWith(q));
  const contains = items.filter((i) => !i.name.toLowerCase().startsWith(q) && i.name.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
