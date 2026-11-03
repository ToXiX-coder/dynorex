/**
 * The models each popular make sold in each model year, shipped with the app (built from NHTSA vPIC by
 * scripts/build-model-catalog.mjs). The model list fills in from this straight away, with no network: offline, on a
 * slow connection and in the pitch demo, whose page can't reach NHTSA. Live NHTSA answers add to it when they come.
 */
import data from "@/data/modelCatalog.json";

type Catalog = Record<string, Record<string, string>>;

/** "2013-2015,2017" holds 2014; "2017" holds 2017. */
export function inRanges(ranges: string, year: number): boolean {
  return ranges.split(",").some((r) => {
    const [a, b] = r.split("-").map(Number);
    return b === undefined ? year === a : year >= a! && year <= b;
  });
}

const byMake = new Map(Object.entries(data as Catalog).map(([make, models]) => [make.toLowerCase(), models]));

/** The make's models for that year, alphabetical; empty when the make or year isn't in the catalog. */
export function catalogModels(make: string, year: number, catalog: Map<string, Record<string, string>> = byMake): string[] {
  const models = catalog.get(make.trim().toLowerCase());
  if (!models || !Number.isInteger(year)) return [];
  return Object.entries(models)
    .filter(([, ranges]) => inRanges(ranges, year))
    .map(([name]) => name);
}
