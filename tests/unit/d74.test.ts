import { describe, expect, it } from "vitest";
import { batteryReadingText, isBatteryCheck } from "@/domain/maintenance";
import { analyzeRun, simulatedRun } from "@/domain/perf";
import { bikeIndexSearchUrl, identFor, isFrameShape, isIdentShape } from "@/domain/record";
import { buildTitle, isPrivatePath, metaDescription, pageTitle } from "@/domain/seo";
import { modFormSchema } from "@/domain/validation/build";
import { emotoCurrent, kindDetail } from "@/domain/vehicleKind";

/** D-74: selling two-wheelers, e-moto runs, mod figures, the battery log and page tags. */

describe("what identifies a vehicle to its buyer", () => {
  it("is the VIN for cars and motorcycles, the frame number for an e-moto", () => {
    expect(identFor("car").name).toBe("VIN");
    expect(identFor("motorcycle").ok("JYARM36E0SA000123")).toBe(true);
    expect(identFor("ebike").name).toBe("frame number");
    expect(identFor("ebike").ok("UB25-00042")).toBe(true);
    expect(identFor("ebike").ok("no spaces!")).toBe(false);
  });

  it("the claim screen takes either, since it doesn't know the kind yet", () => {
    expect(isIdentShape("JF1VA1C60G9812345")).toBe(true);
    expect(isIdentShape("ub25-00042")).toBe(true);
    expect(isFrameShape("--")).toBe(false);
  });

  it("searches Bike Index with what the buyer typed, upper case and encoded", () => {
    expect(bikeIndexSearchUrl(" ub25-00042 ")).toBe("https://bikeindex.org/bikes?serial=UB25-00042&stolenness=all");
    expect(bikeIndexSearchUrl("A B")).toContain("serial=A%20B");
  });
});

describe("e-moto runs", () => {
  it("times 0-30 from a standing start", () => {
    const r = analyzeRun(simulatedRun(10, 56, 4), null)!;
    expect(r.zeroThirty).toBeGreaterThan(2);
    expect(r.zeroThirty).toBeLessThan(4);
    expect(r.zeroSixty).toBeNull(); // a 56 mph e-moto never gets there
  });
});

describe("mods that set an e-moto's numbers", () => {
  const mods = [
    { status: "complete", installed_on: "2026-05-01", status_changed_at: "2026-05-01T10:00:00Z", sets_motor_w: 12000 },
    { status: "complete", installed_on: "2026-08-01", status_changed_at: "2026-08-01T10:00:00Z", sets_motor_w: 18000 },
    { status: "planned", installed_on: null, status_changed_at: "2026-09-01T10:00:00Z", sets_battery_v: 72 },
    {
      status: "complete",
      installed_on: "2026-09-01",
      status_changed_at: "2026-09-01T10:00:00Z",
      sets_motor_w: 25000,
      deleted_at: "2026-09-02T00:00:00Z",
    },
  ];

  it("takes each number from the newest complete, live mod that sets it", () => {
    expect(emotoCurrent(mods)).toEqual({ mod_motor_w: 18000, mod_battery_v: null, mod_battery_wh: null });
  });

  it("names the e-moto by what it runs now", () => {
    expect(kindDetail({ kind: "ebike", motor_w: 8000, battery_v: 60, mod_motor_w: 12000 })).toBe("12 kW · 60V");
  });

  it("keeps the figures only on a motor or battery mod, power in watts", () => {
    const base = {
      name: "X-9000",
      category: "motor",
      brand: "",
      part_number: "",
      cost: "",
      currency: "USD",
      status: "complete",
      notes: "",
      installed_on: "",
    };
    const motor = modFormSchema.parse({ ...base, sets_motor_kw: "18.5", sets_battery_v: "72" });
    expect(motor).toMatchObject({ sets_motor_w: 18500, sets_battery_v: null });
    const pack = modFormSchema.parse({
      ...base,
      category: "battery",
      sets_battery_v: "72",
      sets_battery_wh: "3600",
      sets_motor_kw: "9",
    });
    expect(pack).toMatchObject({ sets_motor_w: null, sets_battery_v: 72, sets_battery_wh: 3600 });
    expect(modFormSchema.safeParse({ ...base, sets_motor_kw: "150" }).success).toBe(false);
  });
});

describe("battery log", () => {
  it("asks for readings on an e-moto battery job only", () => {
    expect(isBatteryCheck("Battery balance and health check", "ebike")).toBe(true);
    expect(isBatteryCheck("Battery", "car")).toBe(false);
    expect(isBatteryCheck("Chain clean and lube", "ebike")).toBe(false);
  });

  it("reads back as one line", () => {
    expect(batteryReadingText({ battery_cycles: 86, battery_full_v: "84.1" })).toBe(
      "86 cycles · 84.1 V at full charge",
    );
    expect(batteryReadingText({ battery_cycles: 1 })).toBe("1 cycle");
    expect(batteryReadingText({})).toBeNull();
  });
});

describe("page tags", () => {
  it("keeps private links out of search", () => {
    for (const p of ["/history/abc", "/confirm/x", "/chat/club/1", "/offers/9", "/garage", "/garage/v1/record"])
      expect(isPrivatePath(p)).toBe(true);
    for (const p of ["/build/v1", "/u/apex_hunter", "/events/e1", "/", "/garages-of-the-world"])
      expect(isPrivatePath(p)).toBe(false);
  });

  it("titles a build by its name, vehicle and mods", () => {
    expect(buildTitle({ nickname: "Trail Bee", year: 2025, make: "Sur-Ron", model: "Light Bee X", mods: 4 })).toBe(
      "Trail Bee: 2025 Sur-Ron Light Bee X build, 4 mods",
    );
    expect(pageTitle("Trail Bee")).toBe("Trail Bee | Dynorex");
  });

  it("keeps descriptions to 160 characters, cut on a word", () => {
    const d = metaDescription("word ".repeat(60));
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("…")).toBe(true);
    expect(metaDescription("Short.", null, "Two parts.")).toBe("Short. Two parts.");
  });
});
