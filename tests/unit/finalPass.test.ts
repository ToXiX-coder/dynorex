import { describe, expect, it } from "vitest";
import { AVATAR_SWATCHES, avatarColor, initials } from "@/domain/avatar";
import { artLabel, bodyStyleFor, PAINTS, paintFor, shade } from "@/domain/vehicleArt";
import { gaugeMax } from "@/domain/gauge";
import { formatRange, sayRange, specRange } from "@/domain/specRange";
import { contrast } from "@/theme/palette";

/** Final pass: car illustrations and avatars. */
describe("car illustrations", () => {
  it("pick the body style from the model (and era)", () => {
    const cases: [string, string, number, string][] = [
      ["Mazda", "MX-5 Miata", 1999, "roadster"],
      ["Subaru", "WRX", 2015, "sedan"],
      ["Mitsubishi", "Lancer Evolution X", 2008, "sedan"],
      ["Nissan", "Skyline GT-R", 1996, "coupe"],
      ["Ford", "Bronco", 2021, "suv"],
      ["Volkswagen", "GTI", 2016, "hatch"],
      ["Chevrolet", "Camaro", 1969, "muscle"],
      ["Chevrolet", "Camaro", 2018, "coupe"],
      ["Honda", "Civic Si", 2019, "sedan"],
      ["Ford", "F-150", 2020, "truck"],
      ["Jeep", "Renegade", 2020, "suv"],
      ["Toyota", "GR86", 2023, "coupe"],
      ["Toyota", "Skyline-ish", 2000, "sedan"], // no partial-word matches
    ];
    for (const [make, model, year, style] of cases) expect(bodyStyleFor(make, model, year), model).toBe(style);
  });

  it("keep a stable paint per car, and honor a color in the name", () => {
    expect(paintFor("abc")).toBe(paintFor("abc"));
    expect(new Set(Array.from({ length: 200 }, (_, i) => paintFor(`car-${i}`).name)).size).toBe(PAINTS.length);
    expect(paintFor("x", "Rally Red Evo").name).toBe("rally red");
    expect(paintFor("x", "Midnight Supra").name).toBe("gunmetal");
    expect(paintFor("x", "Weekend Warrior")).toBe(paintFor("x"));
    expect(paintFor("x", "Reddington")).toBe(paintFor("x")); // whole words only
  });

  it("shade colors and describe themselves as illustrations", () => {
    expect(shade("#808080", 0)).toBe("#808080");
    expect(shade("#000000", 1)).toBe("#ffffff");
    expect(shade("#ffffff", -1)).toBe("#000000");
    expect(artLabel(1999, "Mazda", "MX-5 Miata")).toBe("Illustration of a 1999 Mazda MX-5 Miata (no photo yet)");
  });
});

describe("avatars", () => {
  it("white initials are readable on every avatar color", () => {
    for (const c of AVATAR_SWATCHES) expect(contrast("#FFFFFF", c), c).toBeGreaterThanOrEqual(4.5);
  });

  it("initials and colors are stable", () => {
    expect(initials("Apex Hunter")).toBe("AH");
    expect(initials("@jdm_garage_42")).toBe("JG");
    expect(initials("torq")).toBe("TO");
    expect(initials("")).toBe("?");
    expect(avatarColor("apex_hunter")).toBe(avatarColor("apex_hunter"));
  });
});

describe("power gauge scale", () => {
  it("leaves headroom so the needle never pins, with round full-scale numbers", () => {
    expect(gaugeMax(140)).toBe(300); // stock Miata still uses a sensible dial
    expect(gaugeMax(286)).toBe(400);
    expect(gaugeMax(600)).toBe(900);
    expect(gaugeMax(1200)).toBe(1750);
    expect(gaugeMax(0)).toBe(300);
    expect(gaugeMax(Number.NaN)).toBe(300);
    for (const hp of [50, 199, 333, 777, 1499]) expect(gaugeMax(hp)).toBeGreaterThan(hp);
  });
});

describe("spec estimates are ranges", () => {
  it("brackets the estimate with rounded-out bounds per field", () => {
    expect(formatRange(specRange("hp", 286)!)).toBe("265–305");
    expect(formatRange(specRange("torque", 266)!)).toBe("250–285");
    expect(formatRange(specRange("weight", 3227)!)).toBe("3160–3300");
    expect(formatRange(specRange("zero_to_sixty", 5.3)!)).toBe("4.9–5.7");
    expect(formatRange(specRange("lb_per_hp", 11.3)!)).toBe("10.3–12.3");
    expect(sayRange(specRange("hp", 286)!)).toBe("about 265 to 305");
  });

  it("always contains the estimate and never collapses to one number", () => {
    for (const field of ["hp", "torque", "weight", "zero_to_sixty", "lb_per_hp"] as const)
      for (const v of [0.4, 1, 3.3, 7.9, 140, 268, 999, 4500]) {
        const r = specRange(field, v)!;
        expect(r.low, `${field} ${v}`).toBeLessThanOrEqual(v);
        expect(r.high, `${field} ${v}`).toBeGreaterThanOrEqual(v);
        expect(r.high, `${field} ${v}`).toBeGreaterThan(r.low);
      }
    expect(specRange("hp", 0)).toBeNull();
    expect(specRange("hp", Number.NaN)).toBeNull();
  });
});
