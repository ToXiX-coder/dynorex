/**
 * Torq chat: community mod insights (same shape and rules as public.mod_insights in the database) and the
 * pitch-mode answer writer. In pitch mode there is no server and no AI call: Torq answers from sample builds
 * with fixed rules, and the reply says so. Pure functions, unit tested.
 */
export type ModInsight = {
  name: string;
  category: string;
  builds: number;
  top_brand: string | null;
  complete_pct: number;
  hp_gain_low: number | null;
  hp_gain_typical: number | null;
  hp_gain_high: number | null;
  hp_reports: number | null;
  weight_change_low_lb: number | null;
  weight_change_high_lb: number | null;
};
export type Insights = {
  make: string;
  model: string;
  year: number | null;
  public_builds: number;
  mods: ModInsight[];
  categories: Record<string, number>;
};
export type InsightBuild = {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  mods: {
    name: string;
    category: string;
    brand: string | null;
    status: string;
    hpDelta: number | null;
    weightDelta: number | null;
  }[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Postgres percentile_cont: linear interpolation between the closest ranks. */
export function percentileCont(values: number[], p: number): number {
  const xs = [...values].sort((a, b) => a - b);
  const pos = (xs.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo]! + (xs[hi]! - xs[lo]!) * (pos - lo);
}

/**
 * Mirror of public.mod_insights for already-public builds: same model match (exact or "WRX STI"-style prefix),
 * ±5 model years, mods listed only when 2+ builds use them, gains only when 3+ owners reported them (completed
 * mods), and gains as the 25th–75th percentile range with the median.
 */
export function aggregateInsights(builds: InsightBuild[], make: string, model: string, year: number | null): Insights {
  const mk = norm(make);
  const md = norm(model);
  const cars = builds.filter(
    (b) =>
      norm(b.make) === mk &&
      (norm(b.model) === md || norm(b.model).startsWith(`${md} `)) &&
      (year === null || Math.abs(b.year - year) <= 5),
  );
  type G = {
    names: string[];
    brands: string[];
    category: string;
    cars: Set<string>;
    done: number;
    total: number;
    hp: number[];
    wt: number[];
  };
  const groups = new Map<string, G>();
  const categories: Record<string, Set<string>> = {};
  for (const car of cars)
    for (const m of car.mods) {
      const key = `${norm(m.name)}|${m.category}`;
      const g = groups.get(key) ?? {
        names: [],
        brands: [],
        category: m.category,
        cars: new Set(),
        done: 0,
        total: 0,
        hp: [],
        wt: [],
      };
      g.names.push(m.name);
      if (m.brand) g.brands.push(m.brand);
      g.cars.add(car.vehicleId);
      g.total++;
      if (m.status === "complete") {
        g.done++;
        if (m.hpDelta !== null) g.hp.push(m.hpDelta);
        if (m.weightDelta !== null) g.wt.push(m.weightDelta);
      }
      groups.set(key, g);
      (categories[m.category] ??= new Set()).add(car.vehicleId);
    }
  const mode = (xs: string[]) => {
    if (!xs.length) return null;
    const counts = new Map<string, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  };
  const mods = [...groups.values()]
    .filter((g) => g.cars.size >= 2)
    .map((g): ModInsight => ({
      name: mode(g.names)!,
      category: g.category,
      builds: g.cars.size,
      top_brand: mode(g.brands),
      complete_pct: Math.round((g.done / g.total) * 100),
      hp_gain_low: g.hp.length >= 3 ? Math.round(percentileCont(g.hp, 0.25)) : null,
      hp_gain_typical: g.hp.length >= 3 ? Math.round(percentileCont(g.hp, 0.5)) : null,
      hp_gain_high: g.hp.length >= 3 ? Math.round(percentileCont(g.hp, 0.75)) : null,
      hp_reports: g.hp.length >= 3 ? g.hp.length : null,
      weight_change_low_lb: g.wt.length >= 3 ? Math.round(percentileCont(g.wt, 0.25)) : null,
      weight_change_high_lb: g.wt.length >= 3 ? Math.round(percentileCont(g.wt, 0.75)) : null,
    }))
    .sort((a, b) => b.builds - a.builds || a.name.localeCompare(b.name))
    .slice(0, 15);
  return {
    make: make.trim(),
    model: model.trim(),
    year,
    public_builds: cars.length,
    mods,
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.size])),
  };
}

/** "+15–25 hp (typical +20, 6 owners reported)", or null when too few owners reported a gain. */
export function gainText(m: ModInsight): string | null {
  if (m.hp_gain_low === null || m.hp_gain_high === null) return null;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const range = m.hp_gain_low === m.hp_gain_high ? sign(m.hp_gain_low) : `${sign(m.hp_gain_low)}–${m.hp_gain_high}`;
  return `${range} hp (typical ${sign(m.hp_gain_typical!)}, ${m.hp_reports} owners reported)`;
}

type Intent = "power" | "handling" | "sound" | "brakes" | "weight" | "first" | "popular";
const INTENTS: [Intent, RegExp, string[]][] = [
  [
    "power",
    /\b(power|hp|horse ?power|fast(er)?|quick(er)?|tune|turbo|boost|speed)\b/i,
    ["engine", "electronics", "exhaust"],
  ],
  [
    "handling",
    /\b(handl\w*|corner\w*|suspension|track|grip|lap|coilover\w*|stance)\b/i,
    ["suspension", "wheels", "safety"],
  ],
  ["sound", /\b(sound|loud|exhaust|noise|growl)\b/i, ["exhaust"]],
  ["brakes", /\b(brake\w*|stop\w*|pads|rotors)\b/i, ["safety"]],
  ["weight", /\b(weight|light(er)?|lb|kg)\b/i, ["wheels", "interior", "exterior"]],
  ["first", /\b(first|start\w*|begin\w*|beginner|cheap\w*|budget)\b/i, []],
];
export function detectIntent(question: string): Intent {
  for (const [intent, re] of INTENTS) if (re.test(question)) return intent;
  return "popular";
}

/**
 * Pitch-mode Torq: a short, honest answer from the insights. Skips mods the owner already has, prefers the
 * categories the question is about, quotes build counts and gain RANGES only, and flags legal/safety notes.
 */
export function demoTorqReply(question: string, insights: Insights | null, myMods: string[]): string {
  if (!insights)
    return "Which car are we talking about? Pick one from your garage above and I'll pull what the community runs on it.";
  const car = [insights.year, insights.make, insights.model].filter(Boolean).join(" ");
  if (insights.public_builds < 2 || insights.mods.length === 0)
    return `Not enough community data on the ${car} yet (${insights.public_builds} public build${insights.public_builds === 1 ? "" : "s"}). Log your mods and make your build public to help the next owner. (Pitch mode: sample answer.)`;
  // "Stage 2 tune (planned)" is on the owner's plan, not installed: still worth recommending, flagged as such
  const PLANNED = /\s*\(planned\)$/i;
  const STATUS = /\s*\((planned|in progress)\)$/i;
  const planned = new Set(myMods.filter((x) => PLANNED.test(x)).map((x) => norm(x.replace(PLANNED, ""))));
  const have = new Set(myMods.filter((x) => !PLANNED.test(x)).map((x) => norm(x.replace(STATUS, ""))));
  const intent = detectIntent(question);
  const cats = INTENTS.find(([i]) => i === intent)?.[2] ?? [];
  const notOwned = insights.mods.filter((m) => !have.has(norm(m.name)));
  // stay on topic (power answers don't list brakes) unless nothing on-topic is left
  const onTopic = cats.length ? notOwned.filter((m) => cats.includes(m.category)) : notOwned;
  const candidates = onTopic.length ? onTopic : notOwned;
  const ranked = [...candidates].sort((a, b) => {
    const pa = cats.length ? Number(cats.includes(a.category)) : 0;
    const pb = cats.length ? Number(cats.includes(b.category)) : 0;
    if (intent === "power") {
      const ga = a.hp_gain_typical ?? -1;
      const gb = b.hp_gain_typical ?? -1;
      if (pa !== pb) return pb - pa;
      if (ga !== gb) return gb - ga;
    }
    return pb - pa || b.builds - a.builds;
  });
  const picks = ranked.slice(0, 3);
  if (!picks.length)
    return `You already run everything the ${car} community commonly does. Next step is fine-tuning: alignment, tires and a good tune shop. (Pitch mode: sample answer.)`;
  const lines = picks.map((m) => {
    const gain = gainText(m);
    const onPlan = planned.has(norm(m.name)) ? " Already on your plan, good call." : "";
    return `• ${m.name}: on ${m.builds} of ${insights.public_builds} builds${gain ? `, ${gain}` : ""}.${onPlan}`;
  });
  const notes: string[] = [];
  if (picks.some((m) => /tune|downpipe|catless|delete|header/i.test(m.name)))
    notes.push("Tunes and exhaust parts can affect emissions and inspections, so check the rules where you live.");
  if (picks.some((m) => ["safety", "suspension"].includes(m.category)))
    notes.push("Brakes and suspension: get a pro install and an alignment.");
  const lead =
    intent === "power"
      ? `Here's where ${car} owners find power:`
      : intent === "handling"
        ? `For handling on the ${car}, the community goes:`
        : intent === "first"
          ? `Most ${car} owners start here:`
          : `What the ${car} community runs most:`;
  return [
    lead,
    ...lines,
    ...notes,
    "Gains are owner-reported ranges, not promises. (Pitch mode: sample answer from sample builds.)",
  ].join("\n");
}
