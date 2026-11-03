/**
 * Builds src/data/modelCatalog.json: the models each popular make sold in each model year, from the EPA's
 * fuel-economy dataset (every US light vehicle since 1984, one file, public domain). The app ships it so the
 * model list fills in offline, on slow networks and in the pitch demo (whose page can't reach other sites). Live
 * NHTSA answers still add to it in the app when they arrive.
 *
 * 1. Download https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip and unzip it somewhere outside the repo.
 * 2. node scripts/build-model-catalog.mjs path/to/vehicles.csv
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) throw new Error("Usage: node scripts/build-model-catalog.mjs path/to/vehicles.csv");

// the same list the make picker shows first
const src = readFileSync(new URL("../src/domain/catalog.ts", import.meta.url), "utf8");
const block = src.match(/POPULAR_MAKES = \[([\s\S]*?)\]/)?.[1] ?? "";
const makes = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (!makes.length) throw new Error("POPULAR_MAKES not found");
const canonical = new Map(makes.map((m) => [m.toLowerCase(), m]));

/** One CSV line into fields (quoted fields may hold commas and doubled quotes). */
function fields(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") out.push(cur), (cur = "");
    else cur += c;
  }
  out.push(cur);
  return out;
}

// "F150 Pickup 2WD" and "F150 Pickup 4WD" are one model to an owner; the drive goes in Trim
const DRIVE = /\s*\b(2WD|4WD|AWD|FWD|RWD|4x4|4X4|Ffs|FFS)\b/g;
const clean = (s) => s.replace(DRIVE, "").replace(/\s+/g, " ").trim();

const lines = readFileSync(csvPath, "utf8").split(/\r?\n/);
const head = fields(lines[0]);
const col = (name) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`column ${name} missing`);
  return i;
};
const [iMake, iModel, iBase, iYear] = [col("make"), col("model"), col("baseModel"), col("year")];

const found = new Map(); // make -> model -> Set(years)
for (const line of lines.slice(1)) {
  if (!line) continue;
  const f = fields(line);
  const make = canonical.get(String(f[iMake]).trim().toLowerCase());
  const year = Number(f[iYear]);
  if (!make || !Number.isInteger(year)) continue;
  // the EPA groups some twins ("Legacy/Outback", "626/MX-6"); an owner looks for either name on its own
  const names = clean(f[iBase] || f[iModel] || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const model of names) {
    // "TrailBlazer" and "Trailblazer" are one model: keep the spelling from its newest year
    const byModel = found.get(make) ?? new Map();
    found.set(make, byModel);
    const key = model.toLowerCase();
    const entry = byModel.get(key) ?? { name: model, newest: year, years: new Set() };
    if (year > entry.newest) (entry.name = model), (entry.newest = year);
    entry.years.add(year);
    byModel.set(key, entry);
  }
}

/** 2013,2014,2015,2017 -> "2013-2015,2017": compact, and easy to read in a diff. */
const ranges = (years) => {
  const ys = [...years].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ys.length; i++) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
    out.push(i === j ? `${ys[i]}` : `${ys[i]}-${ys[j]}`);
    i = j;
  }
  return out.join(",");
};

const out = {};
for (const make of makes) {
  const byModel = found.get(make);
  if (!byModel) continue;
  out[make] = Object.fromEntries(
    [...byModel.values()].sort((a, b) => a.name.localeCompare(b.name)).map((e) => [e.name, ranges(e.years)]),
  );
}
mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../src/data/modelCatalog.json", import.meta.url), JSON.stringify(out) + "\n");
const count = Object.values(out).reduce((n, m) => n + Object.keys(m).length, 0);
const missing = makes.filter((m) => !out[m]);
console.log(`Wrote ${count} models across ${Object.keys(out).length} makes.${missing.length ? ` Not in EPA data: ${missing.join(", ")}` : ""}`);
