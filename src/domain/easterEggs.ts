/**
 * Car-culture easter eggs. Every one is triggered by the user's own data or a deliberate tap, never blocks
 * anything, never claims anything about a car's real performance, and has a plain-text version for screen
 * readers. The full list (spoilers) is in docs/easter-eggs.md.
 */

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------- honk: tap a car's picture

type CarRule = { make?: RegExp; model?: RegExp; years?: [number, number]; lines: string[] };

const CAR_RULES: CarRule[] = [
  { make: /delorean/, lines: ["Great Scott! Where we're going, we don't need roads.", "Is that 1.21 gigawatts?"] },
  {
    model: /\bdelorean\b|\bdmc 12\b/,
    lines: ["Great Scott! Where we're going, we don't need roads.", "Is that 1.21 gigawatts?"],
  },
  {
    make: /toyota/,
    model: /\b(ae ?86|corolla)\b/,
    years: [1983, 1987],
    lines: ["Tofu delivery, 4 a.m. sharp.", "Drift the hairpin. Don't spill the water."],
  },
  { make: /toyota/, model: /supra/, lines: ["2JZ goes brrr.", "Is it boosted? It's always boosted."] },
  {
    make: /mazda/,
    model: /\b(miata|mx ?5)\b/,
    lines: ["Miata is always the answer.", "Pop-ups up! (If you've got 'em.)"],
  },
  {
    make: /mazda/,
    model: /\brx ?(7|8)\b/,
    lines: ["Brap brap brap.", "Apex seals: check them. Then check them again."],
  },
  {
    make: /honda|acura/,
    model: /\b(civic|integra|s2000|nsx|crx)\b/,
    lines: ["VTEC just kicked in, yo!", "Redline is a lifestyle."],
  },
  { make: /subaru/, model: /\b(wrx|sti|impreza)\b/, lines: ["Boxer rumble engaged.", "Blow-off valve says: pssssh."] },
  {
    make: /nissan/,
    model: /\b(gt ?r|skyline)\b/,
    lines: ["Godzilla has entered the chat.", "Attesa says: all wheels, all the time."],
  },
  {
    make: /mitsubishi/,
    model: /\b(lancer|evo|evolution)\b/,
    lines: ["Evo mode: rally ready.", "Anti-lag? In this economy?"],
  },
  {
    make: /porsche/,
    model: /\b911\b/,
    lines: ["Engine's in the back. Frunk's in the front.", "Flat-six symphony, live."],
  },
  { make: /jeep/, model: /\bwrangler\b/, lines: ["It's a Jeep thing. Wave!", "Doors off, worries off."] },
  { make: /ford/, model: /\bbronco\b/, lines: ["Trail-rated vibes.", "Air down, send it."] },
  { make: /ford/, model: /\bmustang\b/, lines: ["Pony up!", "Cars and Coffee exit: nice and easy now."] },
  { make: /chevrolet|chevy/, model: /\bcamaro\b/, lines: ["Big block energy.", "Rumble check: passed."] },
  {
    make: /chevrolet|chevy/,
    model: /\bcorvette\b/,
    lines: ["America's sports car, reporting for duty.", "Wave at every other Vette."],
  },
  { make: /volkswagen|vw/, model: /\bbeetle\b/, lines: ["Punch buggy! No punch backs.", "Air-cooled and unbothered."] },
  { make: /toyota/, model: /\bprius\b/, lines: ["Silent but deadly.", "Eco mode: maximum stealth."] },
  {
    make: /bmw/,
    model: /\bm ?[2-8]\b/,
    lines: ["Ultimate driving machine, ultimate grin.", "Indicators sold separately."],
  },
  { make: /tesla/, lines: ["Ludicrous, but quiet.", "Instant torque, zero brap."] },
];

/** What the car "says" when you tap its picture. Every car honks; well-known ones also have a line. */
export function honkLine(make: string, model: string, year: number | null | undefined, tap: number): string {
  const mk = norm(make);
  const md = norm(model);
  const rule = CAR_RULES.find(
    (r) =>
      (!r.make || r.make.test(mk)) &&
      (!r.model || r.model.test(md)) &&
      (!r.years || (year != null && year >= r.years[0] && year <= r.years[1])),
  );
  const generic = ["BEEP BEEP!", "Honk honk!", "Meep meep!"];
  if (!rule) return generic[tap % generic.length]!;
  return tap % 3 === 0 ? "BEEP BEEP!" : rule.lines[(tap - 1 - Math.floor(tap / 3)) % rule.lines.length]!;
}

// ---------------------------------------------------------------- prank parts in the mod form

const PRANK_PARTS: [RegExp, string][] = [
  [/\bblinker fluid\b/, "Blinker fluid? Torq checked. It's sold out everywhere. (It's not a real part.)"],
  [/\bmuffler bearings?\b/, "Muffler bearings: right next to the blinker fluid. (Not a thing.)"],
  [/\bheadlight fluid\b/, "Headlight fluid comes in high beam and low beam. (Nope.)"],
  [/\belbow grease\b/, "Elbow grease: zero hp, infinite shine. Respect."],
  [/\bflux capacitor\b/, "1.21 gigawatts? Bold. Log the real parts so your estimate stays honest."],
  [/\bpiston return springs?\b/, "Piston return springs: the classic new-guy errand. Nice try."],
  [
    /\bracing stripes?\b|\bstickers? (for )?(hp|horsepower)\b/,
    "Stripes and stickers add 10 hp each. Everyone knows that. (The estimate won't count them.)",
  ],
  [/\bspeed holes?\b/, "Speed holes make it go faster. Torq can't prove they don't."],
];

/** Torq's reaction when a mod name is a famous garage prank. Never blocks saving. */
export function prankPartLine(modName: string): string | null {
  const n = norm(modName);
  if (!n) return null;
  return PRANK_PARTS.find(([re]) => re.test(n))?.[1] ?? null;
}

// ---------------------------------------------------------------- search words

const SEARCH_EGGS: [RegExp, string][] = [
  [/^vtec\b/, "VTEC just kicked in, yo."],
  [/^kachow\b|^ka chow\b/, "Ka-chow! Speed. I am speed."],
  [/^(brap ?)+$/, "Brap brap brap. A rotary owner is near."],
  [/^(pssh+|stu+tu+tu+|stututu|sutututu)$/, "Pssssh. Blow-off valve appreciation society."],
  [/^tofu\b/, "Tofu delivery accepted. Mind the hairpins."],
  [/^(skrrt+|skrt+)$/, "Skrrrt. Tires appreciate your restraint on public roads."],
  [/^(vroom ?)+$/, "Vroom vroom. Finding builds at full throttle."],
  [/^(10 ?mm|10mm socket)$/, "The 10 mm socket isn't in the search index either."],
  [/^launch control$/, "Launch control armed. Searching in 3, 2, 1…"],
  [/^torq$/, "That's me! Ask Torq for mod advice anytime."],
];

/** A one-liner shown above search results for certain words. */
export function searchEggLine(query: string): string | null {
  const n = norm(query);
  if (n.length < 3) return null;
  return SEARCH_EGGS.find(([re]) => re.test(n))?.[1] ?? null;
}

// ---------------------------------------------------------------- odometer milestones

/** A badge for a fun odometer reading (the owner's own number). Null when there's nothing to celebrate. */
export function odometerBadge(odometer: number | null | undefined, unit: string): string | null {
  if (odometer == null || !Number.isFinite(odometer) || odometer < 1000) return null;
  const n = Math.floor(odometer);
  const s = String(n);
  if (n % 100_000 === 0) return `${n / 1000}K club`;
  if ("123456789".startsWith(s)) return `Counting up: ${[...s].join("-")}`;
  if (/^(\d)\1+$/.test(s)) return `All ${s[0]}s on the clock`;
  if (s === [...s].reverse().join("") && s.length >= 4) return `Palindrome ${unit}`;
  if (n === 88_000 || n === 88_888) return "88! Great Scott!";
  return null;
}

// ---------------------------------------------------------------- garage o'clock (Home)

/** A greeting under "Your Garage" for certain times of the week. Local time. */
export function garageGreeting(now: Date): string | null {
  const day = now.getDay(); // 0 Sun … 6 Sat
  const h = now.getHours();
  if (h >= 0 && h < 4) return "Late-night garage session? Torque specs still matter at 2 a.m.";
  if ((day === 6 || day === 0) && h >= 6 && h < 11) return "Cars & Coffee o'clock. Go say hi to someone's build.";
  if (day === 5 && h >= 17) return "Friday night: wash it, park it, admire it.";
  if (day === 1 && h >= 5 && h < 9) return "Monday commute. Your daily is the real MVP.";
  return null;
}

// ---------------------------------------------------------------- logo roar and rev limiter

export const LOGO_TAPS_TO_ROAR = 5;
export const ROARS = [
  "RAWR! Launch control engaged.",
  "Torq says: full send (on a track).",
  "Rev-limiter? Never heard of her.",
];

export const REV_LINES = ["Bang, bang! Rev limiter.", "Bouncing off the limiter.", "Easy, it's still on the stand."];

/** Rev the gauge, as a timeline (ms -> 0..1): blip up, bounce off the limiter four times, fall back to idle. */
export function revAt(t: number): number {
  if (t <= 0) return 0;
  if (t < 220) return 1 - (1 - t / 220) ** 2;
  if (t < 700) return 1 - 0.07 * Math.abs(Math.sin(((t - 220) / 480) * Math.PI * 4));
  if (t < 1100) return 1 - (t - 700) / 400;
  return 0;
}
