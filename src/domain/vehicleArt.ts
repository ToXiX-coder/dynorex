/**
 * Until an owner adds a photo, a car is shown as a clean side-profile illustration in its body style, so cards
 * never look empty. Pure rules here; the drawing is components/vehicle/VehicleArt.tsx. It is clearly an
 * illustration (flat colors, no photo look) and is labelled as one for screen readers.
 */
export type BodyStyle = "sedan" | "coupe" | "hatch" | "roadster" | "suv" | "truck" | "muscle";

// Checked in order: the first matching word wins. Models are matched as whole words, case-insensitive.
const MODEL_RULES: [BodyStyle, string[]][] = [
  [
    "truck",
    [
      "f-150",
      "f150",
      "f-250",
      "silverado",
      "sierra",
      "tacoma",
      "tundra",
      "ranger",
      "frontier",
      "ridgeline",
      "colorado",
      "gladiator",
      "hilux",
      "titan",
      "maverick",
      "1500",
      "2500",
    ],
  ],
  [
    "suv",
    [
      "bronco",
      "wrangler",
      "4runner",
      "land cruiser",
      "cherokee",
      "grand cherokee",
      "tahoe",
      "suburban",
      "yukon",
      "rav4",
      "cr-v",
      "crv",
      "pilot",
      "highlander",
      "explorer",
      "defender",
      "g-wagon",
      "g-class",
      "x5",
      "outback",
      "forester",
      "pathfinder",
      "blazer",
      "durango",
      "range rover",
    ],
  ],
  [
    "roadster",
    [
      "miata",
      "mx-5",
      "mx5",
      "s2000",
      "boxster",
      "z4",
      "slk",
      "elise",
      "spider",
      "spyder",
      "roadster",
      "solstice",
      "sky",
    ],
  ],
  [
    "hatch",
    [
      "gti",
      "golf",
      "fiesta",
      "focus",
      "fit",
      "yaris",
      "veloster",
      "mini",
      "cooper",
      "polo",
      "i30",
      "civic type r",
      "type r",
      "gr corolla",
      "impreza hatch",
      "mazda3 hatch",
      "leaf",
    ],
  ],
  [
    "coupe",
    [
      "skyline",
      "gt-r",
      "gtr",
      "supra",
      "brz",
      "86",
      "gr86",
      "frs",
      "fr-s",
      "370z",
      "350z",
      "240sx",
      "silvia",
      "rx-7",
      "rx7",
      "rx-8",
      "nsx",
      "corvette",
      "911",
      "cayman",
      "rc f",
      "m2",
      "m4",
      "q60",
      "genesis coupe",
      "celica",
      "prelude",
      "integra",
      "eclipse",
    ],
  ],
];
// Classic American pony/muscle cars before 1990 get the long-hood muscle profile.
const MUSCLE = [
  "camaro",
  "mustang",
  "challenger",
  "charger",
  "chevelle",
  "gto",
  "nova",
  "cuda",
  "barracuda",
  "firebird",
  "el camino",
  "road runner",
  "torino",
  "corvette",
];
const MAKE_DEFAULTS: Record<string, BodyStyle> = { jeep: "suv", ram: "truck", "land rover": "suv", hummer: "suv" };

const words = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .trim()} `;

export function bodyStyleFor(make: string, model: string, year?: number | null): BodyStyle {
  const m = words(model);
  if (year && year < 1990 && MUSCLE.some((k) => m.includes(` ${k} `))) return "muscle";
  for (const [style, keys] of MODEL_RULES) if (keys.some((k) => m.includes(` ${k} `))) return style;
  if (MUSCLE.some((k) => m.includes(` ${k} `))) return "coupe";
  return MAKE_DEFAULTS[make.trim().toLowerCase()] ?? "sedan";
}

/** Factory-style paint colors. The same car always gets the same color. */
export const PAINTS = [
  { name: "rally red", hex: "#C8102E" },
  { name: "rally blue", hex: "#1F4FA3" },
  { name: "silver", hex: "#AEB4BC" },
  { name: "white", hex: "#E6E9ED" },
  { name: "gunmetal", hex: "#3A3F47" },
  { name: "sunset orange", hex: "#E4752B" },
  { name: "racing green", hex: "#2E6B47" },
  { name: "yellow", hex: "#E9B92F" },
] as const;

// A color named in the build title or nickname ("Rally Red Evo") wins over the hashed one.
const NAMED: [RegExp, (typeof PAINTS)[number]["name"]][] = [
  [/\b(red|crimson|scarlet|cherry)\b/i, "rally red"],
  [/\b(blue|navy|cobalt)\b/i, "rally blue"],
  [/\b(silver|grey|gray|chrome)\b/i, "silver"],
  [/\b(white|pearl|ghost)\b/i, "white"],
  [/\b(black|gunmetal|stealth|shadow|midnight)\b/i, "gunmetal"],
  [/\b(orange|sunset)\b/i, "sunset orange"],
  [/\b(green|emerald|verde)\b/i, "racing green"],
  [/\b(yellow|gold|bumblebee)\b/i, "yellow"],
];

export function paintFor(seed: string, hint?: string | null) {
  const named = hint ? NAMED.find(([re]) => re.test(hint)) : undefined;
  if (named) return PAINTS.find((p) => p.name === named[1])!;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return PAINTS[(h >>> 0) % PAINTS.length]!;
}

/** Lighter / darker shade of a #rrggbb color (amount -1..1), for the body's highlight and shadow. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))
      .toString(16)
      .padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

export function artLabel(year: number | null | undefined, make: string, model: string) {
  return `Illustration of a ${[year, make, model].filter(Boolean).join(" ")} (no photo yet)`;
}

/** Track-focused models get a rear wing in the illustration. */
const WING = /\b(sti|evo|evolution|type r|gt3|gt2|gt-r|gtr|r34|r33|r32|wrx sti|cup|track|tcr)\b/i;
export function hasWing(model: string) {
  return WING.test(model);
}
