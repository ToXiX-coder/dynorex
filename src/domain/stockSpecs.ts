/**
 * Factory ("stock") specs for popular enthusiast cars, used when an owner leaves their stock numbers blank
 * (owner decision D-55). US-market manufacturer figures: SAE horsepower, lb-ft, curb weight in lb (base
 * transmission), and 0–60 only where a figure is widely published (otherwise null: never guessed).
 *
 * The database holds the same rows (migration 20261017000000_stock_specs.sql, kept in sync by a unit test) and
 * fills blank stock numbers on save; this copy runs the same matching for pitch mode and the vehicle form.
 *
 * Matching: make (with aliases like Chevy/VW) and year range must fit; then the vehicle's model + trim, squashed
 * to letters and digits ("MX-5 Miata RF" -> "mx5miatarf"), must start with one of the row's names. The longest
 * name wins, so "WRX STI" gets the STI row and "Mustang" + trim "GT" gets the GT row.
 */
export type StockSpec = {
  make: string;
  /** model (+ trim) names, as typed by people; squashed for matching */
  names: string[];
  from: number;
  to: number;
  /** what the UI calls the match, e.g. "Subaru WRX STI" */
  label: string;
  /** names that start the same but are a different, faster car (Corvette Z06 is not a Corvette Stingray) */
  except?: string[];
  hp: number;
  torque_lbft: number;
  weight_lb: number | null;
  zero_to_sixty_s: number | null;
};

/** a row that must not match some longer names (a different variant) */
const X = (spec: StockSpec, except: string[]): StockSpec => ({ ...spec, except });

const S = (
  make: string,
  label: string,
  names: string[],
  from: number,
  to: number,
  hp: number,
  torque_lbft: number,
  weight_lb: number | null,
  zero_to_sixty_s: number | null = null,
): StockSpec => ({ make, label, names, from, to, hp, torque_lbft, weight_lb, zero_to_sixty_s });

const CORVETTE_FAST = [
  "corvette z06",
  "corvette zr1",
  "corvette grand sport",
  "corvette e ray",
  "corvette stingray z06",
];
const MUSTANG_OTHER = ["mustang shelby", "mustang gt350", "mustang gt500", "mustang bullitt", "mustang mach"];

export const STOCK_SPECS: StockSpec[] = [
  // Subaru
  S("Subaru", "Subaru WRX", ["wrx", "impreza wrx"], 2015, 2021, 268, 258, 3267, 5.4),
  S("Subaru", "Subaru WRX", ["wrx", "impreza wrx"], 2022, 2024, 271, 258, 3320),
  S("Subaru", "Subaru WRX STI", ["wrx sti", "sti", "impreza wrx sti"], 2015, 2018, 305, 290, 3391, 4.6),
  S("Subaru", "Subaru WRX STI", ["wrx sti", "sti", "impreza wrx sti"], 2019, 2021, 310, 290, 3391),
  S("Subaru", "Subaru BRZ", ["brz"], 2013, 2016, 200, 151, 2776),
  S("Subaru", "Subaru BRZ", ["brz"], 2017, 2020, 205, 156, 2798),
  S("Subaru", "Subaru BRZ", ["brz"], 2022, 2024, 228, 184, 2815),
  // Toyota / Scion
  S("Toyota", "Toyota GR86", ["gr86", "gr 86", "86"], 2022, 2024, 228, 184, 2811),
  S("Toyota", "Toyota 86", ["86", "gt86"], 2017, 2020, 205, 156, 2774),
  S("Scion", "Scion FR-S", ["frs"], 2013, 2016, 200, 151, 2758),
  S("Toyota", "Toyota Corolla GT-S (AE86)", ["corolla gts", "ae86", "sprinter trueno"], 1985, 1987, 112, 97, 2350),
  S("Toyota", "Toyota Supra", ["supra"], 1993, 1998, 220, 210, 3210),
  S("Toyota", "Toyota Supra Turbo", ["supra turbo", "supra twin turbo"], 1993, 1998, 320, 315, 3505),
  S("Toyota", "Toyota GR Supra 3.0", ["supra", "gr supra"], 2020, 2020, 335, 365, 3397),
  S("Toyota", "Toyota GR Supra 3.0", ["supra", "gr supra"], 2021, 2024, 382, 368, 3400),
  S("Toyota", "Toyota GR Corolla", ["gr corolla"], 2023, 2024, 300, 273, 3249),
  // Mazda
  S("Mazda", "Mazda MX-5 Miata (NA 1.6)", ["mx5 miata", "miata", "mx5"], 1990, 1993, 116, 100, 2116),
  S("Mazda", "Mazda MX-5 Miata (NA 1.8)", ["mx5 miata", "miata", "mx5"], 1994, 1997, 128, 110, 2293),
  S("Mazda", "Mazda MX-5 Miata (NB)", ["mx5 miata", "miata", "mx5"], 1999, 2000, 140, 119, 2299, 8.0),
  S("Mazda", "Mazda MX-5 Miata (NB)", ["mx5 miata", "miata", "mx5"], 2001, 2005, 142, 125, 2387),
  S("Mazda", "Mazda MX-5 Miata (NC)", ["mx5 miata", "miata", "mx5"], 2006, 2015, 167, 140, 2480),
  S("Mazda", "Mazda MX-5 Miata (ND)", ["mx5 miata", "miata", "mx5"], 2016, 2018, 155, 148, 2332),
  S("Mazda", "Mazda MX-5 Miata (ND2)", ["mx5 miata", "miata", "mx5"], 2019, 2024, 181, 151, 2341),
  S("Mazda", "Mazda RX-7 (FD)", ["rx7"], 1993, 1995, 255, 217, 2800),
  S("Mazda", "Mazda RX-8", ["rx8"], 2004, 2008, 238, 159, 3029),
  // Honda / Acura
  S("Honda", "Honda Civic Si", ["civic si"], 2017, 2020, 205, 192, 2889),
  S("Honda", "Honda Civic Type R", ["civic type r", "civic typer"], 2017, 2021, 306, 295, 3117),
  S("Honda", "Honda Civic Type R", ["civic type r", "civic typer"], 2023, 2024, 315, 310, 3188),
  S("Honda", "Honda S2000", ["s2000"], 2000, 2003, 240, 153, 2809),
  S("Honda", "Honda S2000", ["s2000"], 2004, 2009, 237, 162, 2864),
  S("Acura", "Acura Integra Type R", ["integra type r", "integra typer"], 1997, 2001, 195, 130, 2639),
  // Nissan
  S("Nissan", "Nissan 350Z", ["350z"], 2003, 2004, 287, 274, 3188),
  S("Nissan", "Nissan 350Z", ["350z"], 2007, 2008, 306, 268, 3333),
  X(S("Nissan", "Nissan 370Z", ["370z"], 2009, 2020, 332, 270, 3232), ["370z nismo"]),
  X(S("Nissan", "Nissan GT-R", ["gtr"], 2009, 2011, 480, 430, 3829), ["gtr nismo", "gtr track"]),
  X(S("Nissan", "Nissan GT-R", ["gtr"], 2013, 2016, 545, 463, 3829), ["gtr nismo", "gtr track"]),
  X(S("Nissan", "Nissan GT-R", ["gtr"], 2017, 2024, 565, 467, 3933, 2.9), ["gtr nismo", "gtr track"]),
  S("Nissan", "Nissan Skyline GT-R (R33)", ["skyline gtr", "gtr", "gtr r33"], 1995, 1998, 276, 271, 3390, 5.0),
  S("Nissan", "Nissan Skyline GT-R (R34)", ["skyline gtr", "gtr", "gtr r34"], 1999, 2002, 276, 289, 3440),
  // Mitsubishi
  S(
    "Mitsubishi",
    "Mitsubishi Lancer Evolution VIII",
    ["lancer evolution", "lancer evo", "evo", "evolution"],
    2003,
    2005,
    271,
    273,
    3263,
  ),
  S(
    "Mitsubishi",
    "Mitsubishi Lancer Evolution IX",
    ["lancer evolution", "lancer evo", "evo", "evolution"],
    2006,
    2006,
    286,
    289,
    3285,
  ),
  S(
    "Mitsubishi",
    "Mitsubishi Lancer Evolution X",
    ["lancer evolution", "lancer evo", "evo", "evolution"],
    2008,
    2015,
    291,
    300,
    3517,
    4.9,
  ),
  // Ford
  X(S("Ford", "Ford Mustang EcoBoost", ["mustang", "mustang ecoboost"], 2015, 2017, 310, 320, 3524), MUSTANG_OTHER),
  S("Ford", "Ford Mustang GT", ["mustang gt"], 2011, 2012, 412, 390, 3605),
  X(S("Ford", "Ford Mustang GT", ["mustang gt"], 2015, 2017, 435, 400, 3705), ["mustang gt350", "mustang gt500"]),
  X(S("Ford", "Ford Mustang GT", ["mustang gt"], 2018, 2023, 460, 420, 3805, 4.3), ["mustang gt350", "mustang gt500"]),
  S("Ford", "Ford Focus RS", ["focus rs"], 2016, 2018, 350, 350, 3434),
  S("Ford", "Ford Focus ST", ["focus st"], 2013, 2018, 252, 270, 3223),
  S("Ford", "Ford Fiesta ST", ["fiesta st"], 2014, 2019, 197, 202, 2720),
  X(S("Ford", "Ford Bronco 2.3", ["bronco"], 2021, 2024, 300, 325, 4500, 6.5), [
    "bronco sport",
    "bronco raptor",
    "bronco 27",
  ]),
  // Chevrolet
  S("Chevrolet", "Chevrolet Camaro SS", ["camaro ss"], 2016, 2024, 455, 455, 3685),
  X(
    S(
      "Chevrolet",
      "Chevrolet Corvette Stingray (C7)",
      ["corvette", "corvette stingray"],
      2014,
      2019,
      455,
      460,
      3298,
      3.8,
    ),
    CORVETTE_FAST,
  ),
  X(
    S(
      "Chevrolet",
      "Chevrolet Corvette Stingray (C8)",
      ["corvette", "corvette stingray"],
      2020,
      2024,
      490,
      465,
      3535,
      2.9,
    ),
    CORVETTE_FAST,
  ),
  // Volkswagen
  S("Volkswagen", "Volkswagen Golf GTI (Mk7)", ["golf gti", "gti"], 2015, 2017, 210, 258, 3021),
  S("Volkswagen", "Volkswagen Golf GTI (Mk7.5)", ["golf gti", "gti"], 2018, 2021, 228, 258, 3031),
  S("Volkswagen", "Volkswagen Golf R (Mk7)", ["golf r"], 2015, 2019, 292, 280, 3340),
  // BMW
  X(S("BMW", "BMW M3 (E46)", ["m3"], 2001, 2006, 333, 262, 3415), ["m3 csl"]),
  S("BMW", "BMW M3 (E92)", ["m3"], 2008, 2013, 414, 295, 3704),
  S("BMW", "BMW M2", ["m2"], 2016, 2018, 365, 343, 3450),
  // Hyundai
  S("Hyundai", "Hyundai Veloster N", ["veloster n"], 2019, 2022, 275, 260, 3106),
  S("Hyundai", "Hyundai Elantra N", ["elantra n"], 2022, 2024, 276, 289, 3186),
  // Dodge
  X(
    S(
      "Dodge",
      "Dodge Challenger SRT Hellcat",
      ["challenger hellcat", "challenger srt hellcat"],
      2015,
      2018,
      707,
      650,
      4448,
    ),
    ["challenger hellcat redeye", "challenger srt hellcat redeye"],
  ),
  // Porsche
  X(S("Porsche", "Porsche 911 Carrera (992)", ["911 carrera"], 2020, 2024, 379, 331, 3354), [
    "911 carrera s",
    "911 carrera gts",
    "911 carrera 4s",
  ]),
];

const MAKE_ALIASES: Record<string, string> = { chevy: "chevrolet", vw: "volkswagen" };

/** letters and digits only, lower case ("MX-5 Miata" -> "mx5miata") */
export const squash = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const makeKey = (m: string | null | undefined) => {
  const k = squash(m);
  return MAKE_ALIASES[k] ?? k;
};

/** The best factory spec for a vehicle, or null when we don't have one (never a guess). */
export function matchStockSpec(v: {
  year: number | null | undefined;
  make: string | null | undefined;
  model: string | null | undefined;
  trim?: string | null;
}): StockSpec | null {
  if (!v.year || !v.make || !v.model) return null;
  const target = squash(`${v.model} ${v.trim ?? ""}`);
  const mk = makeKey(v.make);
  let best: { spec: StockSpec; len: number } | null = null;
  for (const spec of STOCK_SPECS) {
    if (makeKey(spec.make) !== mk || v.year < spec.from || v.year > spec.to) continue;
    if (spec.except?.some((e) => target.startsWith(squash(e)))) continue;
    for (const n of spec.names) {
      const k = squash(n);
      if (k && target.startsWith(k) && (!best || k.length > best.len)) best = { spec, len: k.length };
    }
  }
  return best?.spec ?? null;
}

export const BASELINE_FIELDS = [
  "baseline_hp",
  "baseline_torque_lbft",
  "baseline_weight_lb",
  "baseline_zero_to_sixty_s",
] as const;
export type BaselineField = (typeof BASELINE_FIELDS)[number];
const FROM_SPEC: Record<BaselineField, keyof StockSpec> = {
  baseline_hp: "hp",
  baseline_torque_lbft: "torque_lbft",
  baseline_weight_lb: "weight_lb",
  baseline_zero_to_sixty_s: "zero_to_sixty_s",
};

/**
 * Fill blank stock numbers from the factory spec (same rule as the database trigger): the owner's numbers always
 * win; a blank field takes the factory figure if there is one. Returns the values, which fields were looked up,
 * the source, and the match's label.
 */
export function fillBaseline(
  v: { year: number; make: string; model: string; trim_level?: string | null } & Partial<
    Record<BaselineField, number | null>
  >,
) {
  const spec = matchStockSpec({ year: v.year, make: v.make, model: v.model, trim: v.trim_level ?? null });
  const out = {} as Record<BaselineField, number | null>;
  const looked: BaselineField[] = [];
  let mine = false;
  for (const f of BASELINE_FIELDS) {
    const own = v[f];
    if (own !== null && own !== undefined) {
      out[f] = own;
      mine = true;
    } else {
      const val = spec ? (spec[FROM_SPEC[f]] as number | null) : null;
      out[f] = val;
      if (val !== null) looked.push(f);
    }
  }
  return {
    values: out,
    baseline_looked_up: looked,
    baseline_source: mine ? ("user_reported" as const) : looked.length ? ("external" as const) : null,
    baseline_lookup_label:
      looked.length && spec ? `${spec.from === spec.to ? spec.from : `${spec.from}–${spec.to}`} ${spec.label}` : null,
  };
}
