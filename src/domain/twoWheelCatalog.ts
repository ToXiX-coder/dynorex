/**
 * D-71: starter data for motorcycles and e-motos (D-73; stored as kind "ebike"). Six common models of each, with their
 * stock numbers, so picking one
 * in the Add vehicle form fills blank specs the way the factory-spec table does for cars. Every figure says where it
 * came from; anything that couldn't be checked against a published spec (motorcycles checked 2026-11-02, e-motos
 * 2026-11-08) is marked ESTIMATE and is
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

/** D-73: an e-moto, a light electric motorcycle (Sur-Ron, Talaria, Stark). Kind "ebike" in the data. */
export type EbikeSpec = {
  kind: "ebike";
  make: string;
  model: string;
  year: number;
  price_usd: Fig;
  /** PEAK motor power in watts (what e-moto makers quote) */
  motor_w: Fig;
  /** pack voltage and capacity */
  battery_v: Fig;
  battery_wh: Fig;
  /** the maker's range, at the steady speed it states */
  range_mi: Fig;
  /** unrestricted top speed (some are sold limited, e.g. 20 mph in Canada) */
  top_speed_mph: Fig;
  weight_lb: Fig;
  /** sold plated for the road (true) or off-road only (false) */
  street_legal: { v: boolean; est?: true };
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
    make: "Sur-Ron",
    model: "Light Bee X",
    year: 2025,
    price_usd: est(4500),
    motor_w: src(8000),
    battery_v: src(60),
    battery_wh: src(2400),
    range_mi: src(47),
    top_speed_mph: src(47),
    weight_lb: src(126),
    street_legal: { v: false, est: true },
    sources: [
      "https://us.surron.com/lightbee/x (8,000 W peak, 60V 40Ah, 46.6 mph, 46.6 mi at 24.9 mph, 125.6 lb curb)",
    ],
  },
  {
    kind: "ebike",
    make: "Sur-Ron",
    model: "Ultra Bee",
    year: 2025,
    price_usd: est(6900),
    motor_w: src(12500),
    battery_v: src(74),
    battery_wh: src(4070),
    range_mi: src(62),
    top_speed_mph: src(56),
    weight_lb: src(187),
    street_legal: { v: false, est: true },
    sources: ["https://us.surron.com/ultrabee/c (12.5 kW peak, 74V 55Ah, 56 mph, 62 mi at 31 mph, 187 lb)"],
  },
  {
    kind: "ebike",
    make: "Talaria",
    model: "Sting R MX4",
    year: 2025,
    price_usd: est(4300),
    motor_w: est(8000),
    battery_v: src(60),
    battery_wh: src(2700),
    range_mi: src(62),
    top_speed_mph: est(47),
    weight_lb: src(145),
    street_legal: { v: false },
    sources: [
      "https://talariacanada.com/talaria-sting-r-mx4/ (60V 45Ah, 2,700 Wh, 62 mi at 15 mph, 145 lb, off-road use only; MSRP CA$5,799.99)",
      "https://talaria-ebikes.com/product/talaria-sting-r-mx4-expert-edition/ (47+ mph unrestricted, for the Expert)",
    ],
  },
  {
    kind: "ebike",
    make: "E Ride Pro",
    model: "Pro-SS 3.0",
    year: 2025,
    price_usd: est(5000),
    motor_w: src(15800),
    battery_v: src(72),
    battery_wh: src(3600),
    range_mi: est(60),
    top_speed_mph: est(60),
    weight_lb: est(150),
    street_legal: { v: false, est: true },
    sources: ["https://media.gritshift.com/e-ride-pro-ss-3-0/ (15.8 kW peak, 72V 50Ah, about $5,000)"],
  },
  {
    kind: "ebike",
    make: "Segway",
    model: "X260",
    year: 2024,
    price_usd: est(4600),
    motor_w: est(5000),
    battery_v: est(74),
    battery_wh: est(2370),
    range_mi: src(75),
    top_speed_mph: src(47),
    weight_lb: est(123),
    street_legal: { v: false, est: true },
    sources: [
      "https://www.facebook.com/electrekco/posts/segway-launches-60-mph-electric-dirt-bike-and-its-basically-a-full-e-motorcycles/1409136157918778/ (46.6 mph, 74.6 mi, 32Ah)",
    ],
  },
  {
    kind: "ebike",
    make: "Stark Future",
    model: "Varg MX 1.2",
    year: 2025,
    price_usd: est(13590),
    motor_w: src(60000),
    battery_v: src(420),
    battery_wh: src(7200),
    range_mi: est(50),
    top_speed_mph: est(60),
    weight_lb: src(260),
    street_legal: { v: false },
    sources: [
      "https://starkfuture.com/products/stark-varg (80 hp peak, 7.2 kWh 420 V, 260 lb; the road-legal model is the Varg SM)",
      "https://www.electricmotiontech.com/home/stark-varg ($13,590 reported for the earlier model)",
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
  "Sur-Ron",
  "Talaria",
  "E Ride Pro",
  "Segway",
  "Stark Future",
  "CAKE",
  "Rawrr",
  "79Bike",
  "Super73",
  "Zero",
  "KTM",
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
    "Sur-Ron": ["Light Bee X", "Light Bee S", "Ultra Bee", "Hyper Bee", "Storm Bee"],
    Talaria: ["Sting R MX4", "Sting R MX4 Expert", "Sting MX3", "XXX", "X3 Pro", "X3 Mini", "Komodo", "Dragon"],
    "E Ride Pro": ["Pro-SS 3.0", "Pro-SS 2.0", "Pro-S"],
    Segway: ["X260", "X160"],
    "Stark Future": ["Varg MX 1.2", "Varg EX", "Varg SM"],
    CAKE: ["Kalk OR", "Kalk&", "Ösa+", "Makka"],
    Rawrr: ["Mantis", "Mantis X"],
    "79Bike": ["Falcon M"],
    Super73: ["R Adventure", "S2 SE", "ZX"],
    Zero: ["FX", "FXE"],
    KTM: ["Freeride E"],
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

/** D-73: road use, as a choice in the form. */
export const ROAD_USE = [
  { id: "offroad", label: "Off-road only" },
  { id: "street", label: "Street legal" },
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
          n({ ...s.motor_w, v: s.motor_w.v / 1000 }, "kW peak", 1),
          n(s.battery_v, "V"),
          n(s.battery_wh, "Wh"),
          n(s.range_mi, "mi range"),
          n(s.top_speed_mph, "mph"),
          n(s.weight_lb, "lb"),
          `${s.street_legal.est ? "~" : ""}${s.street_legal.v ? "street legal" : "off-road only"}`,
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
