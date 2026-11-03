import { describe, expect, it } from "vitest";
import { brandOptions, categoryForModName, modNameOptions } from "@/domain/catalog";
import { EBIKES, MOTORCYCLES, starterModels, starterSpec, starterSummary } from "@/domain/twoWheelCatalog";
import { vehicleForKind, vehicleFormSchema } from "@/domain/validation/build";
import { categoryForKind, KIND_CATEGORIES, kindOf, kindSpecFields } from "@/domain/vehicleKind";

describe("vehicle kinds (D-71)", () => {
  it("anything saved before kinds existed reads as a car", () => {
    expect(kindOf({})).toBe("car");
    expect(kindOf(null)).toBe("car");
    expect(kindOf({ kind: "ebike" })).toBe("ebike");
    expect(kindOf({ kind: "spaceship" })).toBe("car");
  });

  it("cars keep exactly their nine categories", () => {
    expect(KIND_CATEGORIES.car).toEqual([
      "engine",
      "suspension",
      "exhaust",
      "aero",
      "interior",
      "wheels",
      "exterior",
      "electronics",
      "safety",
    ]);
  });

  it("car mod names and category guesses are unchanged", () => {
    expect(categoryForModName("BC coilovers")).toBe("suspension");
    expect(categoryForModName("Brake pads")).toBe("safety");
    expect(modNameOptions(null).some((o) => o.value === "Clip-ons")).toBe(false);
    expect(brandOptions(null).some((o) => o.value === "Bafang")).toBe(false);
  });

  it("two-wheel names land in their own categories", () => {
    expect(categoryForModName("Brake pads", "motorcycle")).toBe("brakes");
    expect(categoryForModName("Akrapovic slip-on", "motorcycle")).toBe("exhaust");
    expect(categoryForModName("Rizoma clip ons", "motorcycle")).toBe("controls");
    expect(categoryForModName("Bafang motor swap", "ebike")).toBe("motor");
    expect(categoryForModName("Second battery", "ebike")).toBe("battery");
    expect(categoryForModName("Gates belt", "ebike")).toBe("drivetrain");
    expect(categoryForModName("Dropper seatpost", "ebike")).toBe("cockpit");
    // a car category the e-bike doesn't have moves to the closest one it does
    expect(categoryForKind("engine", "ebike")).toBe("motor");
    expect(categoryForKind("aero", "motorcycle")).toBe("exterior");
  });

  it("an e-bike's mods only change weight", () => {
    expect(kindSpecFields("ebike")).toEqual(["weight"]);
    expect(kindSpecFields("motorcycle")).toHaveLength(4);
  });

  it("a saved e-bike has no VIN or car numbers, and nothing else carries e-bike numbers", () => {
    const base = {
      year: 2024,
      make: "Lectric",
      model: "XP 3.0",
      vin: "JF1VA1A60F9800012",
      trim_level: "",
      nickname: "",
      description: "",
      odometer: "",
      baseline_torque_lbft: "",
      baseline_weight_lb: "",
      baseline_zero_to_sixty_s: "",
      odometer_unit: "mi",
      visibility: "private",
      baseline_hp: "100",
      motor_w: "500",
    };
    const ebike = vehicleForKind(vehicleFormSchema.parse({ ...base, kind: "ebike" }));
    expect(ebike.vin).toBeNull();
    expect(ebike.baseline_hp).toBeNull();
    expect(ebike.motor_w).toBe(500);
    const car = vehicleForKind(vehicleFormSchema.parse(base));
    expect(car.kind).toBe("car");
    expect(car.motor_w).toBeNull();
  });
});

describe("two-wheel starter list", () => {
  it("has six of each, every one with a source", () => {
    expect(MOTORCYCLES).toHaveLength(6);
    expect(EBIKES).toHaveLength(6);
    for (const s of [...MOTORCYCLES, ...EBIKES]) expect(s.sources.length).toBeGreaterThan(0);
  });

  it("finds models by make, any case", () => {
    expect(starterModels("motorcycle", "yamaha")).toEqual(["MT-07"]);
    const xp = starterSpec("ebike", "LECTRIC", "xp 3.0");
    expect(xp?.kind === "ebike" && xp.motor_w.v).toBe(500);
    expect(starterSpec("car", "Yamaha", "MT-07")).toBeNull();
  });

  it("marks estimates in the summary", () => {
    expect(starterSummary(starterSpec("ebike", "Aventon", "Level.2")!)).toMatch(/~ is an estimate/);
    expect(starterSummary(starterSpec("ebike", "Lectric", "XP 3.0")!)).not.toMatch(/~/);
  });
});
