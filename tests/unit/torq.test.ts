import { describe, expect, it } from "vitest";
import { isStock } from "@/domain/specRange";
import {
  aggregateInsights,
  demoTorqReply,
  detectIntent,
  gainText,
  percentileCont,
  type InsightBuild,
} from "@/domain/torq";
import { garageContext, parseChatRequest, TORQ_SYSTEM, TORQ_TOOL } from "../../supabase/functions/_shared/torq";

const car = (id: string, mods: InsightBuild["mods"], model = "WRX", year = 2016): InsightBuild => ({
  vehicleId: id,
  make: "Subaru",
  model,
  year,
  mods,
});
const m = (name: string, hp: number | null, status = "complete", category = "engine") => ({
  name,
  category,
  brand: null,
  status,
  hpDelta: hp,
  weightDelta: null,
});

describe("community insights (mirror of public.mod_insights)", () => {
  it("matches Postgres percentile_cont", () => {
    expect(percentileCont([10, 14, 20, 26, 40], 0.25)).toBe(14);
    expect(percentileCont([10, 14, 20, 26, 40], 0.5)).toBe(20);
    expect(percentileCont([1, 2, 3, 4], 0.25)).toBe(1.75);
  });

  it("same thresholds as the database: 2+ builds to list, 3+ reports for a gain range", () => {
    const builds = [
      car("a", [m("Cold Air Intake", 10), m("Downpipe", 30)]),
      car("b", [m("cold air  intake", 14), m("Downpipe", 25)]),
      car("c", [m("Cold Air Intake", 20)]),
      car("d", [m("Cold Air Intake", 26), m("One-off kit", 100)]),
      car("e", [m("Cold Air Intake", 40)]),
      car("f", [m("Cold Air Intake", 99)], "BRZ"),
      car("g", [m("Cold Air Intake", 99)], "WRX", 1990),
    ];
    const r = aggregateInsights(builds, "subaru", "wrx", 2016);
    expect(r.public_builds).toBe(5);
    expect(r.mods.map((x) => [x.name, x.builds])).toEqual([
      ["Cold Air Intake", 5],
      ["Downpipe", 2],
    ]);
    expect(gainText(r.mods[0]!)).toBe("+14–26 hp (typical +20, 5 owners reported)");
    expect(gainText(r.mods[1]!)).toBeNull(); // only 2 reports: no gain shown
  });
});

describe("pitch-mode Torq answers", () => {
  const insights = aggregateInsights(
    [
      car("a", [
        m("Cold air intake", 10),
        m("Stage 2 tune", 45, "complete", "electronics"),
        m("Coilovers", null, "complete", "suspension"),
      ]),
      car("b", [
        m("Cold air intake", 8),
        m("Stage 2 tune", 55, "complete", "electronics"),
        m("Coilovers", null, "complete", "suspension"),
      ]),
      car("c", [m("Cold air intake", 12), m("Stage 2 tune", 60, "complete", "electronics")]),
    ],
    "Subaru",
    "WRX",
    2015,
  );

  it("reads what the owner is after", () => {
    expect(detectIntent("how do I make it faster?")).toBe("power");
    expect(detectIntent("best handling upgrades for track")).toBe("handling");
    expect(detectIntent("what should I do first")).toBe("first");
    expect(detectIntent("hello")).toBe("popular");
  });

  it("recommends from the data, skips what the owner has, gives ranges and legal/safety notes", () => {
    const power = demoTorqReply("more power please", insights, ["Cold Air Intake"]);
    expect(power.split("\n")[1]).toMatch(
      /^• Stage 2 tune: on 3 of 3 builds, \+50–58 hp \(typical \+55, 3 owners reported\)/,
    );
    expect(power).not.toMatch(/Cold air intake:/); // already installed
    expect(power).toMatch(/emissions/);
    expect(power).toMatch(/Pitch mode/);
    expect(demoTorqReply("handling", insights, [])).toMatch(/Coilovers[\s\S]*pro install/);
  });

  it("planned mods are still recommended (flagged), installed ones are skipped", () => {
    const r = demoTorqReply("more power", insights, ["Cold air intake", "Stage 2 tune (planned)"]);
    expect(r).toMatch(/Stage 2 tune: on 3 of 3 builds[^\n]*Already on your plan/);
    expect(r).not.toMatch(/• Cold air intake/);
    expect(r).not.toMatch(/Coilovers/); // a power question stays on power mods
  });

  it("is honest when there's no car or not enough data", () => {
    expect(demoTorqReply("power?", null, [])).toMatch(/Which car/);
    const thin = aggregateInsights([car("a", [m("Intake", 10)])], "Subaru", "WRX", 2015);
    expect(demoTorqReply("power?", thin, [])).toMatch(/Not enough community data/);
  });
});

describe("torq-chat server rules", () => {
  it("validates and trims the request", () => {
    expect(parseChatRequest(null)).toBeNull();
    expect(parseChatRequest({ messages: [] })).toBeNull();
    expect(parseChatRequest({ messages: [{ role: "system", content: "x" }] })).toBeNull();
    expect(
      parseChatRequest({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "yo" },
        ],
      }),
    ).toBeNull();
    const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    long.push({ role: "user", content: `${"x".repeat(5000)}\u0007` });
    const r = parseChatRequest({
      messages: long,
      car: { year: 2015, make: "Subaru", model: "WRX", myMods: ["Intake"] },
    })!;
    expect(r.messages.length).toBeLessThanOrEqual(12);
    expect(r.messages[0]!.role).toBe("user");
    expect(r.messages.at(-1)!.content).toHaveLength(1000);
    expect(r.car).toEqual({ year: 2015, make: "Subaru", model: "WRX", myMods: ["Intake"] });
    expect(garageContext(r.car)).toBe(
      "Garage context: the owner is asking about their 2015 Subaru WRX. Mods they already have or plan: Intake.",
    );
  });

  it("keeps the honesty, range, privacy and safety rules in the prompt, and a strict tool schema", () => {
    for (const rule of [
      /Never invent community numbers/,
      /always ranges/,
      /never call anything verified/,
      /emissions/,
      /individual community members/,
    ])
      expect(TORQ_SYSTEM).toMatch(rule);
    expect(TORQ_TOOL.strict).toBe(true);
    expect(TORQ_TOOL.input_schema.additionalProperties).toBe(false);
  });
});

describe("stock cars", () => {
  it("show exact numbers until a mod is complete", () => {
    expect(isStock({ completed_mods_counted: 0 })).toBe(true);
    expect(isStock(null)).toBe(true);
    expect(isStock({ completed_mods_counted: "2" })).toBe(false);
  });
});
