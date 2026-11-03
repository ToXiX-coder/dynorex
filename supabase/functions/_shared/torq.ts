// Torq chat: the fixed persona/rules, the one tool Torq can call, and request validation.
// Plain TypeScript (no Deno or SDK imports) so tests/unit/torq.test.ts can check it.
//
// What leaves Dynorex for the model provider: the conversation text, the car (year/make/model), the asker's
// OWN mod names if they chose a car from their garage, and aggregated public community data. Never usernames,
// emails, VINs, costs, notes, or anyone else's individual build.

export const TORQ_MODEL = "claude-opus-5-5";
export const MAX_HISTORY = 12;
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_TOOL_ROUNDS = 4;

export const TORQ_SYSTEM = `You are Torq, the mascot of Dynorex: an angular T-Rex mechanic with a tachometer for an eye. You help car owners pick mods that fit their car, using what the Dynorex community has actually done to the same model.

How you work:
- Use the get_community_mods tool for any question about what people run on a specific car. Ask for year, make and model if you don't know the car yet. Never invent community numbers: every count, share or gain you mention must come from the tool result in this conversation.
- Gains are always ranges. Say them like "+15–25 hp (typical +20, 6 owners reported)". Never give a single exact number for what a part will do, and never call anything verified, certified or dyno-proven: these are owner-reported estimates and parts make different power on different cars, days and dynos.
- Say how much data there is ("12 public builds"). If there are few builds or no reported gains, say so plainly and label anything else as general car knowledge, not community data.
- Fit the advice to the owner: their goal, budget hints, and the mods they already have (given in the garage context; ones marked (planned) aren't installed yet, so they're fair to recommend and you can say the plan matches what the community does). Point out what usually comes first, what depends on what (for example tunes after intake/exhaust), and trade-offs (noise, comfort, reliability, warranty).
- Safety and the law come first. Do not help remove or defeat emissions equipment, and mention that legality varies by state/country (emissions rules, noise limits, inspection). For brakes, suspension, tires and anything safety-critical, recommend professional installation and alignment where it applies. Never encourage street racing; point people to track days.
- Never mention or guess anything about individual community members; you only see totals.

Style: punchy, friendly, a little gearhead swagger, no fluff. Keep answers under about 150 words. Use at most 3 short bullet picks, each with the reason and the community numbers. End with one follow-up question when it helps.`;

/** The single tool. Strict schema; the server runs it as the signed-in user against public data only. */
export const TORQ_TOOL = {
  name: "get_community_mods",
  description:
    "Get aggregated, public Dynorex community data for a car model: how many public builds exist and the most common mods (name, category, how many builds use it, share completed, and the owner-reported horsepower gain as a 25th–75th percentile range with the median, only when at least 3 owners reported it). Use it before recommending mods for a specific car.",
  input_schema: {
    type: "object",
    properties: {
      make: { type: "string", description: "Car make, e.g. Subaru" },
      model: { type: "string", description: "Car model, e.g. WRX" },
      year: { type: ["integer", "null"], description: "Model year if known; matches builds within 5 years" },
    },
    required: ["make", "model", "year"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type CarContext = { year: number | null; make: string; model: string; myMods: string[] };
export type ChatRequest = { messages: ChatTurn[]; car: CarContext | null };

const clean = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "";

/** Validate and trim what the app sends. Returns null for anything malformed (the function answers 400). */
export function parseChatRequest(body: unknown): ChatRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { messages?: unknown; car?: unknown };
  if (!Array.isArray(b.messages) || b.messages.length === 0) return null;
  const messages: ChatTurn[] = [];
  for (const m of b.messages.slice(-MAX_HISTORY)) {
    const role = (m as { role?: unknown })?.role;
    const content = clean((m as { content?: unknown })?.content, MAX_MESSAGE_CHARS);
    if ((role !== "user" && role !== "assistant") || !content) return null;
    messages.push({ role, content });
  }
  // the API needs the first turn to be the user's and the last one to be the new question
  while (messages.length && messages[0]!.role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1]!.role !== "user") return null;

  let car: CarContext | null = null;
  if (b.car && typeof b.car === "object") {
    const c = b.car as { year?: unknown; make?: unknown; model?: unknown; myMods?: unknown };
    const make = clean(c.make, 40);
    const model = clean(c.model, 60);
    const year = Number.isInteger(c.year) && (c.year as number) >= 1900 && (c.year as number) <= 2100 ? (c.year as number) : null;
    const myMods = Array.isArray(c.myMods) ? c.myMods.map((x) => clean(x, 80)).filter(Boolean).slice(0, 30) : [];
    if (make && model) car = { year, make, model, myMods };
  }
  return { messages, car };
}

/** Garage context, prepended to the first user turn (after the cached system prompt, so caching still works). */
export function garageContext(car: CarContext | null): string {
  if (!car) return "Garage context: the owner hasn't picked a car yet.";
  const name = [car.year, car.make, car.model].filter(Boolean).join(" ");
  return `Garage context: the owner is asking about their ${name}.${
    car.myMods.length ? ` Mods they already have or plan: ${car.myMods.join("; ")}.` : " They haven't logged any mods yet."
  }`;
}
