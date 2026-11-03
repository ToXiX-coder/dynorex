/**
 * D-71: starter data for motorcycles and e-bikes. Six common models of each, with their stock numbers, so picking one
 * in the Add vehicle form fills blank specs the way the factory-spec table does for cars. Every figure says where it
 * came from; anything that couldn't be checked against a published spec (checked 2026-11-02) is marked ESTIMATE and is
 * shown that way in the app. Prices are US list prices (MSRP before destination and fees) and change often.
 */
import type { VehicleKind } from "./vehicleKind";

/** A number, and whether it was checked against a published source ("source") or is our estimate ("estimate"). */
export type Fig = { v: number; est?: true };

export type MotorcycleSpec = {
  kind: "motorcycle";
  make: string;
  model: string;
  year: number;
  price_usd: Fig;
  engine_cc: Fig;
  hp: Fig | null;
  torque_lbft: Fig | null;
  /** wet (with fluids) unless the source only gives another basis, noted in `weightBasis` */
  weight_lb: Fig;
  weightBasis: string;
  top_speed_mph: Fig;
  zero_to_sixty_s?: Fig;
  sources: string[];
};

export type EbikeSpec = {
  kind: "ebike";
  make: string;
  model: string;
  year: number;
  price_usd: Fig;
  /** nominal (continuous) motor power */
  motor_w: Fig;
  battery_wh: Fig;
  /** the maker's or a test's real-world range, mixed riding */
  range_mi: Fig;
  /** assisted top speed (its US e-bike class) */
  top_speed_mph: Fig;
  /** D-72: US class as sold (1 pedal assist to 20 mph, 2 throttle to 20 mph, 3 pedal assist to 28 mph) */
  ebike_class: Fig;
  weight_lb: Fig;
  sources: string[];
};

export type TwoWheelSpec = MotorcycleSpec | EbikeSpec;

const est = (v: number): Fig => ({ v, est: true });
const src = (v: number): Fig => ({ v });

export const MOTORCYCLES: MotorcycleSpec[] = [
  {
    kind: "motorcycle",
    make: "Yamaha",
    model: "MT-07",
    year: 2025,
    price_usd: src(8599),
    engine_cc: src(689),
    hp: src(72),
    torque_lbft: src(50),
    weight_lb: src(403),
    weightBasis: "wet",
    top_speed_mph: est(130),
    sources: [
      "https://yamahamotorsports.com/models/25-mt-07/specs (MSRP)",
      "https://www.motorcyclespecs.co.za/model/yamaha/yamaha-mt07-2025.html (torque, wet weight)",
      "https://www.chaseontwowheels.com/motorcycles/2025-yamaha-mt-07/ (72 hp; Yamaha USA doesn't publish power)",
    ],
  },
  {
    kind: "motorcycle",
    make: "Kawasaki",
    model: "Ninja 500",
    year: 2026,
    price_usd: src(5799),
    engine_cc: src(451),
    hp: src(51),
    torque_lbft: src(32),
    weight_lb: src(377),
    weightBasis: "curb (ABS)",
    top_speed_mph: est(115),
    sources: [
      "https://www.kawasaki.com/en-us/motorcycle/ninja/sport/ninja-500/2026-ninja-500 (MSRP ABS, curb weight)",
      "https://www.autoevolution.com/moto/kawasaki-ninja-500-2024.html (power, torque)",
    ],
  },
  {
    kind: "motorcycle",
    make: "Honda",
    model: "CBR650R",
    year: 2025,
    price_usd: src(9899),
    engine_cc: src(649),
    hp: est(94),
    torque_lbft: est(46),
    weight_lb: src(466),
    weightBasis: "wet (E-Clutch)",
    top_speed_mph: est(140),
    sources: [
      "https://powersports.honda.com/motorcycle/sport/cbr650r (2025 MSRP)",
      "https://www.motorcyclistonline.com/reviews/honda-cbr650r-review-with-video/ (displacement, wet weight)",
    ],
  },
  {
    kind: "motorcycle",
    make: "Harley-Davidson",
    model: "Sportster S",
    year: 2025,
    price_usd: src(15999),
    engine_cc: src(1252),
    hp: src(121),
    torque_lbft: src(93),
    weight_lb: src(502),
    weightBasis: "in running order",
    top_speed_mph: est(130),
    sources: [
      "https://www.harley-davidson.com/us/en/motorcycles/2025/sportster-s.html (power, torque, weight, MSRP)",
      "https://www.harley-davidson.com/us/en/motorcycles/sportster-s.html (starting MSRP)",
    ],
  },
  {
    kind: "motorcycle",
    make: "Ducati",
    model: "Monster",
    year: 2025,
    price_usd: src(13295),
    engine_cc: src(937),
    hp: src(111),
    torque_lbft: src(69),
    weight_lb: src(395),
    weightBasis: "wet, no fuel",
    top_speed_mph: est(140),
    sources: [
      "https://www.ducati.com/us/en/bikes/monster/monster-937 (starting price)",
      "https://www.ducati.com/us/en/bikes/monster/monster-937/insights (power, torque, weight)",
    ],
  },
  {
    kind: "motorcycle",
    make: "BMW",
    model: "R 1300 GS",
    year: 2025,
    price_usd: src(19945),
    engine_cc: src(1300),
    hp: src(145),
    torque_lbft: src(110),
    weight_lb: src(523),
    weightBasis: "road ready, fully fueled",
    // BMW states "over 120 mph"
    top_speed_mph: src(120),
    zero_to_sixty_s: src(3.6),
    sources: [
      "https://www.bmwmotorcycles.com/en/models/adventure/r1300gs/technicaldata.html (power, torque, weight, top speed)",
      "https://www.cycleworld.com/motorcycle-reviews/bmw-r-1300-gs-review/ (MSRP, measured 0-60 of 3.63 s)",
    ],
  },
];

export const EBIKES: EbikeSpec[] = [
  {
    kind: "ebike",
    make: "Rad Power Bikes",
    model: "RadRover 6 Plus",
    year: 2024,
    price_usd: est(1699),
    motor_w: src(750),
    battery_wh: src(672),
    range_mi: est(45),
    top_speed_mph: est(20),
    ebike_class: est(2),
    weight_lb: est(73),
    sources: ["https://electricbikereport.com/rad-power-bikes-radrover-6-review/ (motor, battery)"],
  },
  {
    kind: "ebike",
    make: "Aventon",
    model: "Level.2",
    year: 2024,
    price_usd: est(1799),
    motor_w: est(500),
    battery_wh: est(672),
    range_mi: est(60),
    top_speed_mph: est(28),
    ebike_class: est(3),
    weight_lb: est(63),
    sources: ["https://www.aventon.com/blogs/aventon_bikes/meet-level-2-aventons-first-electric-bike-with-a-torque-sensor (model)"],
  },
  {
    kind: "ebike",
    make: "Specialized",
    model: "Turbo Vado 4.0",
    year: 2025,
    price_usd: est(4100),
    motor_w: src(250),
    battery_wh: src(710),
    range_mi: est(50),
    top_speed_mph: est(28),
    ebike_class: src(3),
    weight_lb: src(58),
    sources: [
      "https://www.specialized.com/us/en/turbo-vado-2-40/p/206159 (motor, battery, weight)",
      "https://www.bikeradar.com/reviews/bikes/electric-bikes/specialized-turbo-vado-4-0-review (US price at launch)",
    ],
  },
  {
    kind: "ebike",
    make: "Lectric",
    model: "XP 3.0",
    year: 2024,
    price_usd: src(999),
    motor_w: src(500),
    battery_wh: src(499),
    range_mi: src(24),
    top_speed_mph: src(28),
    ebike_class: est(3),
    weight_lb: src(62),
    sources: [
      "https://electricbikereview.com/lectric-ebikes/lectric-xp-3-0-review/ (motor, battery, price)",
      "https://riderguide.com/reviews/lectric-xp-3-0-electric-bike-review/ (tested range, top speed, weight)",
    ],
  },
  {
    kind: "ebike",
    make: "Super73",
    model: "S2 SE",
    year: 2025,
    price_usd: src(3145),
    motor_w: src(500),
    battery_wh: src(780),
    range_mi: src(25),
    top_speed_mph: est(28),
    ebike_class: est(2),
    weight_lb: est(70),
    sources: [
      "https://super73.com/products/super73-s2-se-legacy (price)",
      "https://super73.com/pages/compare-bikes (motor, battery, range 20-25 mi)",
    ],
  },
  {
    kind: "ebike",
    make: "Trek",
    model: "Allant+ 7",
    year: 2024,
    price_usd: src(3599),
    motor_w: est(250),
    battery_wh: src(500),
    range_mi: est(50),
    top_speed_mph: est(20),
    ebike_class: est(1),
    weight_lb: src(54),
    sources: [
      "https://www.trekbikes.com/us/en_US/bikes/hybrid-bikes/electric-hybrid-bikes/allant/allant-7/a/30918/ (weight, size L)",
      "https://electricbikereview.com/trek/allant-plus-7/ (price, Bosch Performance Line CX, 500 Wh)",
    ],
  },
];

const ALL: TwoWheelSpec[] = [...MOTORCYCLES, ...EBIKES];

/** Makes for the pick-list, popular first; anyone can still type their own. */
export const MOTORCYCLE_MAKES = [
  "Harley-Davidson",
  "Honda",
  "Yamaha",
  "Kawasaki",
  "Suzuki",
  "BMW",
  "Ducati",
  "Triumph",
  "KTM",
  "Indian",
  "Royal Enfield",
  "Aprilia",
  "Husqvarna",
  "MV Agusta",
  "Moto Guzzi",
  "Zero",
  "LiveWire",
  "CFMoto",
];
export const EBIKE_MAKES = [
  "Rad Power Bikes",
  "Aventon",
  "Lectric",
  "Specialized",
  "Trek",
  "Super73",
  "Cannondale",
  "Giant",
  "Gazelle",
  "Tern",
  "Riese & Müller",
  "Ride1Up",
  "Velotric",
  "Juiced",
  "Himiwav",
  "Heybike",
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Starter models for a make (any year), for the model pick-list. */
/**
 * D-72: current model names for the popular makes, so the model list works offline and where NHTSA can't be
 * reached (and for e-bikes, which NHTSA doesn't list at all). Names only; stock numbers come from the six above.
 */
const MODEL_NAMES: Record<"motorcycle" | "ebike", Record<string, string[]>> = {
  motorcycle: {
    "Harley-Davidson": ["Sportster S", "Nightster", "Street Glide", "Road Glide", "Fat Boy", "Low Rider S", "Breakout", "Pan America 1250"],
    Honda: ["CBR650R", "CBR500R", "CBR1000RR-R Fireblade", "CB650R", "Rebel 500", "Rebel 1100", "Africa Twin", "Transalp", "Grom", "Gold Wing"],
    Yamaha: ["MT-07", "MT-09", "MT-03", "YZF-R7", "YZF-R3", "YZF-R1", "Ténéré 700", "XSR700", "XSR900", "Bolt"],
    Kawasaki: ["Ninja 500", "Ninja 650", "Ninja ZX-6R", "Ninja ZX-10R", "Z650", "Z900", "Versys 650", "KLR650", "Vulcan S"],
    Suzuki: ["GSX-R600", "GSX-R750", "GSX-R1000", "GSX-8S", "SV650", "V-Strom 650", "V-Strom 800DE", "Hayabusa", "DR650S"],
    BMW: ["R 1300 GS", "R 1250 RT", "S 1000 RR", "M 1000 RR", "F 900 R", "G 310 R", "R nineT", "K 1600 GT"],
    Ducati: ["Monster", "Panigale V2", "Panigale V4", "Streetfighter V4", "Multistrada V4", "Scrambler Icon", "DesertX", "Diavel V4"],
    Triumph: ["Street Triple 765", "Speed Triple 1200", "Trident 660", "Speed 400", "Bonneville T120", "Tiger 900", "Rocket 3"],
    KTM: ["390 Duke", "790 Duke", "1290 Super Duke R", "RC 390", "390 Adventure", "890 Adventure"],
    Indian: ["Scout", "Chief", "Chieftain", "Challenger", "FTR", "Springfield"],
    "Royal Enfield": ["Classic 350", "Hunter 350", "Interceptor 650", "Continental GT 650", "Himalayan"],
  },
  ebike: {
    "Rad Power Bikes": ["RadRover 6 Plus", "RadCity 5 Plus", "RadRunner 3 Plus", "RadWagon 4", "RadExpand 5"],
    Aventon: ["Level.2", "Pace 500.3", "Sinch.2", "Abound", "Aventure.2"],
    Lectric: ["XP 3.0", "XP Lite 2.0", "XPeak", "XPress", "Xpedition"],
    Specialized: ["Turbo Vado 4.0", "Turbo Vado SL", "Turbo Como", "Turbo Tero", "Turbo Levo"],
    Trek: ["Allant+ 7", "FX+ 2", "Verve+ 3", "Fetch+ 2", "Rail 9.7"],
    Super73: ["S2 SE", "R Adventure", "ZX", "C1X"],
    Cannondale: ["Tesoro Neo X", "Adventure Neo", "Moterra Neo"],
    Giant: ["Explore E+", "Talon E+", "FastRoad E+", "Trance X E+"],
    Gazelle: ["Ultimate C380", "Eclipse", "Medeo T9"],
    Tern: ["GSD", "HSD", "Vektron"],
    Ride1Up: ["700 Series", "Prodigy", "Revv 1"],
    Velotric: ["Discover 2", "Nomad 1", "Packer 1"],
    Juiced: ["RipRacer", "Scorpion X", "CrossCurrent X"],
  },
};

/** Models for a make (any year): the starter specs first, then the name list, without repeats. */
export function starterModels(kind: VehicleKind, make: string): string[] {
  const withSpecs = ALL.filter((s) => s.kind === kind && same(s.make, make)).map((s) => s.model);
  const names = kind === "car" ? [] : (Object.entries(MODEL_NAMES[kind]).find(([m]) => same(m, make))?.[1] ?? []);
  const out: string[] = [];
  for (const n of [...withSpecs, ...names]) if (!out.some((x) => same(x, n))) out.push(n);
  return out;
}

/** What each US e-bike class means, in the words a buyer or insurer would use. */
export const EBIKE_CLASSES = [
  { id: 1, label: "Class 1", detail: "Pedal assist only, up to 20 mph" },
  { id: 2, label: "Class 2", detail: "Throttle allowed, up to 20 mph" },
  { id: 3, label: "Class 3", detail: "Pedal assist up to 28 mph" },
] as const;

/** The starter entry for exactly this make and model, or null. */
export function starterSpec(kind: VehicleKind, make: string, model: string): TwoWheelSpec | null {
  return ALL.find((s) => s.kind === kind && same(s.make, make) && same(s.model, model)) ?? null;
}

/** "72 hp · 50 lb-ft · 403 lb · from $8,599 (estimates marked ~)": the numbers in one line, for the form. */
export function starterSummary(s: TwoWheelSpec): string {
  const n = (f: Fig | null | undefined, unit: string, decimals = 0) =>
    f ? `${f.est ? "~" : ""}${f.v.toLocaleString(undefined, { maximumFractionDigits: decimals })} ${unit}` : null;
  const parts =
    s.kind === "motorcycle"
      ? [n(s.engine_cc, "cc"), n(s.hp, "hp"), n(s.torque_lbft, "lb-ft"), n(s.weight_lb, "lb"), n(s.zero_to_sixty_s, "s 0–60", 1)]
      : [
          `${s.ebike_class.est ? "~" : ""}Class ${s.ebike_class.v}`,
          n(s.motor_w, "W"),
          n(s.battery_wh, "Wh"),
          n(s.range_mi, "mi range"),
          n(s.top_speed_mph, "mph"),
          n(s.weight_lb, "lb"),
        ];
  const price = `${s.price_usd.est ? "~" : ""}$${s.price_usd.v.toLocaleString()} new`;
  const text = [...parts.filter(Boolean), price].join(" · ");
  return /~/.test(text) ? `${text} (~ is an estimate)` : text;
}

/** "2025 Yamaha MT-07 (some figures estimated)": the line under specs that came from this list. */
export function starterLabel(s: TwoWheelSpec): string {
  const figs = Object.values(s).filter((x): x is Fig => typeof x === "object" && x !== null && "v" in x);
  return `${s.year} ${s.make} ${s.model}${figs.some((f) => f.est) ? " (some figures are estimates)" : ""}`;
}
