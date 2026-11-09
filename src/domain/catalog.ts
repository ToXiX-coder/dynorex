/**
 * Pick-lists for the add/edit forms (years, popular makes, common mods and well-known aftermarket brands per
 * category). They make entry fast and keep names consistent, which also makes community data (Torq) cleaner.
 * Every dropdown still accepts free text: nothing here limits what an owner can enter.
 */
import type { ModCategoryId } from "./validation/build";
import { categoryForKind, KIND_CATEGORIES, type VehicleKind } from "./vehicleKind";

export type Option = { value: string; label: string; detail?: string };

export function yearOptions(now = new Date()): Option[] {
  const top = now.getFullYear() + 1;
  return Array.from({ length: top - 1949 }, (_, i) => {
    const y = String(top - i);
    return { value: y, label: y };
  });
}

/** Shown first in the make list (and used on their own if the national list can't load). */
export const POPULAR_MAKES = [
  "Acura",
  "Alfa Romeo",
  "Audi",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Fiat",
  "Ford",
  "Genesis",
  "GMC",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Jaguar",
  "Jeep",
  "Kia",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Lotus",
  "Mazda",
  "Mercedes-Benz",
  "MINI",
  "Mitsubishi",
  "Nissan",
  "Polestar",
  "Pontiac",
  "Porsche",
  "Ram",
  "Rivian",
  "Saab",
  "Scion",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
];

export const MOD_NAMES: Record<ModCategoryId, string[]> = {
  engine: [
    "Cold air intake",
    "Turbo upgrade",
    "Supercharger kit",
    "Front-mount intercooler",
    "Top-mount intercooler",
    "Intake manifold",
    "Throttle body",
    "Fuel injectors",
    "Fuel pump",
    "Oil cooler",
    "Catch can",
    "Radiator",
    "Engine mounts",
    "Blow-off valve",
    "Charge pipes",
    "Camshafts",
    "Headers",
    "Spark plugs",
    "Ignition coils",
  ],
  exhaust: [
    "Cat-back exhaust",
    "Axle-back exhaust",
    "Downpipe",
    "J-pipe",
    "Mid-pipe",
    "High-flow catalytic converter",
    "Muffler delete",
    "Resonator delete",
  ],
  suspension: [
    "Coilovers",
    "Lowering springs",
    "Shocks and struts",
    "Sway bars",
    "Control arms",
    "End links",
    "Strut tower brace",
    "Bushings",
    "Camber kit",
    "Air suspension",
    "Lift kit",
    "Leveling kit",
  ],
  wheels: ["Lightweight wheels", "Performance tires", "All-terrain tires", "Wheel spacers", "Lug nuts", "Wider wheels"],
  safety: [
    "Big brake kit",
    "Brake pads",
    "Brake rotors",
    "Stainless brake lines",
    "Brake fluid",
    "Roll bar",
    "Roll cage",
    "Racing harness",
    "Fire extinguisher",
  ],
  electronics: [
    "ECU tune",
    "Stage 1 tune",
    "Stage 2 tune",
    "Piggyback tuner",
    "Gauges",
    "Boost gauge",
    "Wideband",
    "Data logger",
    "Lighting upgrade",
  ],
  interior: [
    "Bucket seats",
    "Steering wheel",
    "Quick release hub",
    "Short shifter",
    "Shift knob",
    "Pedal covers",
    "Floor mats",
  ],
  exterior: [
    "Wrap",
    "Paint",
    "Paint protection film",
    "Window tint",
    "Front lip",
    "Side skirts",
    "Rear diffuser",
    "Hood",
    "Fender flares",
  ],
  aero: ["Rear wing", "Spoiler", "Splitter", "Canards", "Diffuser", "Vortex generators", "Flat underbody"],
  // D-71: two-wheel categories
  brakes: ["Brake pads", "Brake rotors", "Braided brake lines", "Radial master cylinder", "Brake fluid"],
  controls: ["Clip-ons", "Handlebar", "Rearsets", "Levers", "Grips", "Quickshifter", "Bar-end weights", "Foot pegs"],
  luggage: ["Saddlebags", "Top case", "Tank bag", "Tail bag", "Luggage rack", "Panniers"],
  motor: ["Motor upgrade", "Controller upgrade", "Speed sensor", "Thumb throttle", "Twist throttle"],
  battery: ["Range extender battery", "Larger battery", "Fast charger", "Battery lock"],
  drivetrain: ["Chain", "Cassette", "Chainring", "Derailleur", "Belt drive", "Pedals", "Cranks"],
  cockpit: ["Handlebar", "Stem", "Grips", "Saddle", "Dropper seatpost", "Suspension seatpost", "Display", "Mirror"],
};

/**
 * Kind-specific names where the car list would read wrong ("Lift kit" on an e-bike). Anything not listed here falls
 * back to MOD_NAMES, so cars are exactly as before.
 */
const KIND_MOD_NAMES: Partial<Record<VehicleKind, Partial<Record<ModCategoryId, string[]>>>> = {
  motorcycle: {
    engine: ["Air filter", "Fuel tuner", "Velocity stacks", "Big bore kit", "Camshafts", "Clutch kit", "Radiator", "Oil cooler", "Sprockets"],
    exhaust: ["Slip-on exhaust", "Full exhaust system", "Headers", "Cat delete", "Link pipe"],
    suspension: ["Fork cartridges", "Fork springs", "Rear shock", "Steering damper", "Lowering link", "Triple clamps"],
    wheels: ["Forged wheels", "Sport tires", "Adventure tires", "Spoked wheels", "Lightweight sprockets"],
    electronics: ["ECU flash", "Auxiliary lights", "LED headlight", "Integrated tail light", "USB charger", "Phone mount", "Dash cam"],
    exterior: ["Windscreen", "Fender eliminator", "Frame sliders", "Tank pad", "Wrap", "Paint", "Belly pan", "Seat cowl"],
    safety: ["Crash bars", "Engine guards", "Skid plate", "Radiator guard", "Hand guards", "Alarm", "GPS tracker"],
  },
  // D-73: e-moto mods (Sur-Ron, Talaria and friends): controllers and packs first, then gearing and chassis
  ebike: {
    motor: ["Controller upgrade", "Motor upgrade", "Phase wire upgrade", "Throttle upgrade", "Tune or mode unlock"],
    battery: ["72V battery", "Larger battery", "Fast charger", "Battery guard", "Battery strap"],
    drivetrain: ["Rear sprocket", "Front sprocket", "Chain", "Chain tensioner", "Primary reduction kit"],
    suspension: ["Fork upgrade", "Rear shock", "Linkage", "Fork springs", "Triple clamps"],
    wheels: ["19-inch wheel conversion", "Off-road tires", "Street tires", "Rim locks", "Wheelset"],
    brakes: ["Brake upgrade", "Brake pads", "Larger rotors", "Brake lines"],
    controls: ["Handlebar", "Bar riser", "Grips", "Foot pegs", "Brake levers", "Thumb throttle"],
    electronics: ["Headlight", "Display", "Turn signals", "Horn", "GPS tracker", "Mirrors"],
    exterior: ["Plastics kit", "Graphics kit", "Seat", "Number plate", "Fenders", "Frame guards"],
    safety: ["Hand guards", "Skid plate", "Battery protector", "Lock", "Alarm"],
  },
};
const KIND_BRANDS: Partial<Record<VehicleKind, Partial<Record<ModCategoryId, string[]>>>> = {
  motorcycle: {
    engine: ["Dynojet", "K&N", "BMC", "Barnett", "Rekluse", "Vortex"],
    exhaust: ["Akrapovič", "Yoshimura", "Two Brothers", "SC-Project", "Arrow", "Vance & Hines", "Termignoni"],
    suspension: ["Öhlins", "Andreani", "K-Tech", "Race Tech", "Wilbers", "Hyperpro"],
    wheels: ["Marchesini", "OZ Racing", "Excel", "Michelin", "Pirelli", "Dunlop", "Bridgestone", "Metzeler"],
    electronics: ["Denali", "Clearwater", "Rizoma", "Quad Lock", "Healtech", "FuelMoto"],
    exterior: ["Puig", "Rizoma", "R&G", "Evotech", "TechSpec"],
    safety: ["SW-Motech", "Givi", "R&G", "Barkbusters", "Acerbis"],
  },
  ebike: {
    motor: ["EBMX", "Ko Moto", "BAC", "Sabvoton", "Sur-Ron", "Talaria"],
    battery: ["EBMX", "Chi Battery Systems", "Sur-Ron", "Talaria"],
    drivetrain: ["Warp 9", "Ko Moto", "EBMX", "RK", "Regina"],
    suspension: ["Fastace", "DNM", "KKE", "Manitou", "Öhlins", "RockShox"],
    wheels: ["Warp 9", "CST", "Maxxis", "Kenda", "Michelin", "Dunlop"],
    brakes: ["Magura", "Hope", "Galfer", "EBC", "Nissin"],
    controls: ["Renthal", "ProTaper", "Warp 9", "Ko Moto", "ODI"],
    electronics: ["EBMX", "Denali", "Baja Designs", "Ko Moto"],
    exterior: ["Ko Moto", "Warp 9", "Sur-Ron", "Talaria", "Decal Works"],
    safety: ["Cycra", "Acerbis", "Warp 9", "Ko Moto", "Kryptonite"],
  },
};

export const BRANDS: Record<ModCategoryId, string[]> = {
  engine: [
    "AEM",
    "aFe",
    "COBB",
    "Cosworth",
    "GrimmSpeed",
    "Garrett",
    "HKS",
    "Injector Dynamics",
    "K&N",
    "Mishimoto",
    "Perrin",
    "Skunk2",
    "Turbosmart",
    "Walbro",
  ],
  exhaust: [
    "Akrapovič",
    "Borla",
    "Corsa",
    "Flowmaster",
    "GReddy",
    "Invidia",
    "MagnaFlow",
    "Milltek",
    "Nameless",
    "Remus",
    "Tomei",
  ],
  suspension: ["BC Racing", "Bilstein", "Eibach", "Fortune Auto", "H&R", "KW", "Koni", "Ohlins", "Tein", "Whiteline"],
  wheels: [
    "BBS",
    "Enkei",
    "Konig",
    "OZ Racing",
    "Rays",
    "Work",
    "Bridgestone",
    "Continental",
    "Michelin",
    "Pirelli",
    "Toyo",
    "Yokohama",
  ],
  safety: ["Brembo", "EBC", "Hawk", "StopTech", "Wilwood", "Motul", "Sparco", "Takata", "Cusco"],
  electronics: ["AEM", "COBB", "EcuTek", "Haltech", "Hondata", "HP Tuners", "Innovate", "Link", "Prosport"],
  interior: ["Bride", "Corbeau", "Momo", "NRG", "Recaro", "Sparco"],
  exterior: ["3M", "Avery Dennison", "Seibon", "Varis", "Rocket Bunny"],
  aero: ["APR Performance", "Seibon", "Varis", "Voltex", "Verus Engineering"],
  brakes: ["Brembo", "EBC", "Galfer", "HEL", "Shimano", "SRAM", "Magura", "TRP", "Tektro"],
  controls: ["Rizoma", "LighTech", "Woodcraft", "Pazzo", "Renthal", "ProTaper"],
  luggage: ["Givi", "SW-Motech", "Kriega", "Nelson-Rigg", "Ortlieb", "Thule"],
  motor: ["Bafang", "Bosch", "Shimano", "Grin Technologies", "Specialized", "Brose"],
  battery: ["Bosch", "Shimano", "Grin Technologies", "Unit Pack Power", "Specialized"],
  drivetrain: ["Shimano", "SRAM", "Gates", "KMC", "Enviolo", "Pinion"],
  cockpit: ["Ergon", "Brooks", "Selle Royal", "Thudbuster", "Redshift", "Kinekt", "SQlab"],
};

const CATEGORY_LABELS: Record<ModCategoryId, string> = {
  engine: "Engine",
  exhaust: "Exhaust",
  suspension: "Suspension",
  wheels: "Wheels",
  safety: "Safety",
  electronics: "Electronics",
  interior: "Interior",
  exterior: "Exterior",
  aero: "Aero",
  brakes: "Brakes",
  controls: "Controls",
  luggage: "Luggage",
  motor: "Motor",
  battery: "Battery",
  drivetrain: "Drivetrain",
  cockpit: "Cockpit",
};

const namesFor = (c: ModCategoryId, kind: VehicleKind) => KIND_MOD_NAMES[kind]?.[c] ?? MOD_NAMES[c];
const brandsFor = (c: ModCategoryId, kind: VehicleKind) => KIND_BRANDS[kind]?.[c] ?? BRANDS[c];

/**
 * Mod names for the chosen category, or every mod this kind of vehicle offers (with its category shown) when none
 * is chosen yet.
 */
export function modNameOptions(category: ModCategoryId | null, kind: VehicleKind = "car"): Option[] {
  // the catalog's own order, so a car's list reads exactly as it did before D-71
  const cats = category
    ? [category]
    : (Object.keys(MOD_NAMES) as ModCategoryId[]).filter((c) => KIND_CATEGORIES[kind].includes(c));
  return cats.flatMap((c) =>
    namesFor(c, kind).map((n) => ({ value: n, label: n, detail: category ? undefined : CATEGORY_LABELS[c] })),
  );
}

/** The category a catalog mod name belongs to (so picking a name can fill in the category). */
/**
 * Keyword rules for names people type themselves ("Garrett GTX turbo kit", "BC coilovers"). Order matters:
 * the more specific rule wins ("steering wheel" is interior, not wheels; "brake lights" are electronics).
 */
const CATEGORY_KEYWORDS: [ModCategoryId, RegExp][] = [
  [
    "exhaust",
    /exhaust|down ?pipe|j ?pipe|mid ?pipe|test ?pipe|muffler|resonator|cat ?back|axle ?back|header|catalytic|\bcats?\b|\btips?\b|straight ?pipe/,
  ],
  [
    "engine",
    /valve ?springs?|(engine|motor|trans(mission)?) ?mounts?|turbo|super ?charger|intercooler|\bintake\b|blow ?off/,
  ],
  ["electronics", /\b(brake|tail|head|fog|turn|interior|under ?glow|light ?bar)\s?lights?\b|\bled\b|\bhid\b/],
  [
    "safety",
    /brake|rotor|caliper|\bpads?\b|roll ?(bar|cage)|harness|fire ?ext|seat ?belt|\bhans\b|kill ?switch|tow ?hook/,
  ],
  [
    "interior",
    /steering ?wheel|\bseats?\b|bucket|shifter|shift ?knob|pedal|floor ?mat|\bmats?\b|quick ?release|\bhub\b|headliner|upholster|alcantara|dash ?(trim|kit)|door ?cards?|gauge ?pod/,
  ],
  [
    "electronics",
    /\btun(e|ed|ing|er)\b|\becu\b|flash|piggyback|gauge|wideband|logger|\blights?\b|lighting|stereo|speaker|radio|\bsub(woofer)?\b|\bamp\b|head ?unit|carplay|dash ?cam|camera|alarm|remote start|\bobd\b|sensor/,
  ],
  ["wheels", /\bwheels?\b|\btires?\b|\btyres?\b|\brims?\b|spacer|\blugs?\b|lug ?nuts?|tpms/],
  [
    "suspension",
    /coilover|spring|shock|strut|sway ?bar|anti ?roll|control ?arm|end ?link|bushing|camber|caster|\btoe\b|air ?(ride|bags?|suspension)|lift ?kit|level(ing)?|lower(ing)?|tie ?rod|subframe|alignment/,
  ],
  [
    "engine",
    /intake|turbo|super ?charger|intercooler|manifold|throttle|injector|fuel|oil|catch ?can|radiator|engine|motor|blow ?off|\bbov\b|\bcams?\b|camshaft|valve|piston|\brods?\b|head ?gasket|clutch|flywheel|transmission|gear ?box|diff(erential)?|\blsd\b|boost|spark ?plug|coil ?pack|nitrous|ignition|swap|axle|drive ?shaft|cool(ant|ing)|\bhoses?\b|pulley|\bbelt\b/,
  ],
  ["aero", /\bwing\b|spoiler|splitter|canard|diffuser|vortex|underbody|under ?tray|air ?dam|ducktail/],
  [
    "exterior",
    /wrap|paint|\bppf\b|tint|\blip\b|skirt|\bhood\b|fender|flare|bumper|grille?|mirror|body ?kit|widebody|vinyl|decal|badge|emblem|\btrim\b|window|roof ?rack|bull ?bar|winch|tow/,
  ],
];

/** D-71: two-wheel words, checked before the car rules (which then map to the closest category the kind has). */
const KIND_KEYWORDS: Partial<Record<VehicleKind, [ModCategoryId, RegExp][]>> = {
  motorcycle: [
    ["exhaust", /slip ?on|link ?pipe|full ?system|\bcans?\b/],
    ["brakes", /brake|rotor|caliper|\bpads?\b|master ?cyl/],
    ["luggage", /luggage|saddle ?bags?|panniers?|top ?case|tank ?bag|tail ?bag|\brack\b/],
    ["controls", /clip ?ons?|handle ?bars?|\bbars?\b|rear ?sets?|levers?|\bgrips?\b|pegs?|quick ?shift|bar ?ends?/],
    ["safety", /crash ?bars?|engine ?guards?|skid ?plate|hand ?guards?|frame ?sliders?|\balarm\b|tracker/],
    ["suspension", /fork|steering ?damper|lowering ?link|triple ?clamp/],
  ],
  ebike: [
    ["battery", /battery|\b(48|52|60|72|74|84)v\b|\bpack\b|charger|\bcells?\b|\bah\b/],
    // part words only, never brand names (Ko Moto and EBMX make plastics and batteries too)
    ["motor", /motor|controller|x-?9000|phase ?wires?|throttle|tune|unlock|derestrict/],
    ["drivetrain", /sprocket|chain|primary|reduction|gearing|\bgears?\b|\bbelt\b/],
    ["safety", /hand ?guards?|skid ?plate|bash ?plate|\block\b|alarm|tracker/],
    ["brakes", /brake|rotor|caliper|\bpads?\b/],
    ["controls", /handle ?bars?|\bbars?\b|riser|\bgrips?\b|pegs?|levers?/],
    ["exterior", /plastics?|graphics?|decals?|\bseat\b|number ?plate|fenders?|frame ?guards?/],
    ["suspension", /fork|shock|linkage|triple ?clamps?|springs?/],
    ["wheels", /\bwheels?\b|\btires?\b|\btyres?\b|\brims?\b|rim ?locks?|19 ?(inch|in)/],
    ["electronics", /\blights?\b|headlight|\bled\b|turn ?signals?|display|horn|mirrors?|\bgps\b/],
  ],
};

/**
 * Which category a mod belongs to, from its name: an exact common-mod match first, then keyword rules for
 * names people type themselves. Null when we can't tell (the owner picks). Only categories the vehicle's kind
 * offers come back; cars behave exactly as before D-71.
 */
export function categoryForModName(name: string, kind: VehicleKind = "car"): ModCategoryId | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const c of KIND_CATEGORIES[kind]) if (namesFor(c, kind).some((x) => x.toLowerCase() === n)) return c;
  const words = n.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ");
  const own = KIND_KEYWORDS[kind]?.find(([, re]) => re.test(words))?.[0];
  if (own) return own;
  return categoryForKind(CATEGORY_KEYWORDS.find(([, re]) => re.test(words))?.[0] ?? null, kind);
}

/**
 * Brands for the chosen category first, then the rest of this kind's brands (deduplicated, alphabetical within
 * each group).
 */
export function brandOptions(category: ModCategoryId | null, kind: VehicleKind = "car"): Option[] {
  const first = category ? [...brandsFor(category, kind)].sort((a, b) => a.localeCompare(b)) : [];
  const rest = [...new Set(KIND_CATEGORIES[kind].flatMap((c) => brandsFor(c, kind)))]
    .filter((b) => !first.includes(b))
    .sort((a, b) => a.localeCompare(b));
  return [...first, ...rest].map((b) => ({ value: b, label: b }));
}

/** Search a pick-list: names that start with the query first, then names that contain it. */
export function filterOptions(options: Option[], query: string, limit = 200): Option[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const starts = options.filter((o) => o.label.toLowerCase().startsWith(q));
  const contains = options.filter((o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Popular makes first, then the full national list, without duplicates. */
export function makeOptions(all: { name: string }[] | null): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const name of [...POPULAR_MAKES, ...(all ?? []).map((m) => m.name)]) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ value: name, label: name, detail: POPULAR_MAKES.includes(name) ? "Popular" : undefined });
  }
  return out;
}
