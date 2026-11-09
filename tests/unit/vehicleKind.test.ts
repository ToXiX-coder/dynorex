import { describe, expect, it } from "vitest";
import { brandOptions, categoryForModName, modNameOptions } from "@/domain/catalog";
import { EBIKES, MOTORCYCLES, starterModels, starterSpec, starterSummary } from "@/domain/twoWheelCatalog";
import { vehicleForKind, vehicleFormSchema } from "@/domain/validation/build";
import { categoryForKind, KIND_CATEGORIES, kindDetail, kindOf, kindSpecFields } from "@/domain/vehicleKind";
import { MAINTENANCE_PRESETS, presetsFor, suggestNextDue } from "@/domain/maintenance";

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
    // D-73: e-moto mods
    expect(categoryForModName("EBMX X-9000 controller", "ebike")).toBe("motor");
    expect(categoryForModName("72V 50Ah pack", "ebike")).toBe("battery");
    expect(categoryForModName("Warp 9 rear sprocket 58T", "ebike")).toBe("drivetrain");
    expect(categoryForModName("Fastace fork", "ebike")).toBe("suspension");
    expect(categoryForModName("Ko Moto plastics kit", "ebike")).toBe("exterior");
    expect(categoryForModName("ProTaper bars", "ebike")).toBe("controls");
    // a car category the e-moto doesn't have moves to the closest one it does
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

describe("two-wheel details (D-72)", () => {
  const base = {
    year: 2025,
    make: "Yamaha",
    model: "MT-07",
    vin: "",
    trim_level: "",
    nickname: "",
    description: "",
    odometer: "",
    baseline_hp: "",
    baseline_torque_lbft: "",
    baseline_weight_lb: "",
    baseline_zero_to_sixty_s: "",
    odometer_unit: "mi",
    visibility: "private",
  };

  it("keeps engine size on motorcycles and class and frame serial on e-bikes only", () => {
    const moto = vehicleForKind(
      vehicleFormSchema.parse({ ...base, kind: "motorcycle", engine_cc: "689", ebike_class: "3", frame_serial: "abc-123" }),
    );
    expect(moto).toMatchObject({ engine_cc: 689, ebike_class: null, frame_serial: null });
    const ebike = vehicleForKind(
      vehicleFormSchema.parse({ ...base, kind: "ebike", engine_cc: "689", ebike_class: "3", frame_serial: "abc-123" }),
    );
    expect(ebike).toMatchObject({ engine_cc: null, ebike_class: 3, frame_serial: "ABC-123" });
    const car = vehicleForKind(vehicleFormSchema.parse({ ...base, engine_cc: "689" }));
    expect(car.engine_cc).toBeNull();
  });

  it("takes an e-moto's peak power up to 100 kW, its pack voltage and road use (D-73)", () => {
    const varg = vehicleForKind(
      vehicleFormSchema.parse({ ...base, kind: "ebike", motor_w: "60000", battery_v: "420", street_legal: false }),
    );
    expect(varg).toMatchObject({ motor_w: 60000, battery_v: 420, street_legal: false });
    expect(vehicleFormSchema.safeParse({ ...base, kind: "ebike", motor_w: "150000" }).success).toBe(false);
    const car = vehicleForKind(vehicleFormSchema.parse({ ...base, battery_v: "72", street_legal: true }));
    expect(car).toMatchObject({ battery_v: null, street_legal: null });
  });

  it("refuses an impossible class or serial", () => {
    expect(vehicleFormSchema.safeParse({ ...base, kind: "ebike", ebike_class: "4" }).success).toBe(false);
    expect(vehicleFormSchema.safeParse({ ...base, kind: "ebike", frame_serial: "no spaces allowed" }).success).toBe(false);
  });

  it("names the detail after the model", () => {
    expect(kindDetail({ kind: "motorcycle", engine_cc: 1252 })).toBe("1,252cc");
    expect(kindDetail({ kind: "ebike", motor_w: 12500, battery_v: 74 })).toBe("12.5 kW · 74V");
    expect(kindDetail({ kind: "ebike", motor_w: 8000 })).toBe("8 kW");
    expect(kindDetail({ kind: "car", engine_cc: 2000 })).toBeNull();
  });

  it("lists models offline for popular makes, starter specs first", () => {
    const yamaha = starterModels("motorcycle", "yamaha");
    expect(yamaha[0]).toBe("MT-07");
    expect(yamaha).toContain("YZF-R7");
    expect(new Set(yamaha).size).toBe(yamaha.length);
    expect(starterModels("ebike", "talaria")[0]).toBe("Sting R MX4");
    expect(starterModels("ebike", "Talaria")).toContain("XXX");
  });

  it("gives each kind its own maintenance jobs, cars unchanged", () => {
    expect(presetsFor("car")).toBe(MAINTENANCE_PRESETS);
    expect(presetsFor("motorcycle").map((p) => p.title)).toContain("Chain clean and lube");
    expect(presetsFor("ebike").map((p) => p.title)).toContain("Swingarm and linkage bearings");
    // a motorcycle oil change suggests its own interval
    expect(suggestNextDue("Oil change", "2026-01-15", 10000, "motorcycle").next_due_odometer).toBe(14000);
    expect(suggestNextDue("Oil change", "2026-01-15", 10000).next_due_odometer).toBe(15000);
  });
});

describe("two-wheel starter list", () => {
  it("has six of each, every one with a source", () => {
    expect(MOTORCYCLES).toHaveLength(6);
    expect(EBIKES).toHaveLength(6);
    for (const s of [...MOTORCYCLES, ...EBIKES]) expect(s.sources.length).toBeGreaterThan(0);
  });

  it("finds models by make, any case", () => {
    expect(starterModels("motorcycle", "yamaha")[0]).toBe("MT-07");
    const lbx = starterSpec("ebike", "SUR-RON", "light bee x");
    expect(lbx?.kind === "ebike" && lbx.motor_w.v).toBe(8000);
    expect(starterSpec("car", "Yamaha", "MT-07")).toBeNull();
  });

  it("marks estimates in the summary", () => {
    expect(starterSummary(starterSpec("ebike", "Segway", "X260")!)).toMatch(/~ is an estimate/);
    expect(starterSummary(starterSpec("ebike", "Stark Future", "Varg MX 1.2")!)).toMatch(/^60 kW peak · 420 V/);
    expect(starterSummary(starterSpec("motorcycle", "Harley-Davidson", "Sportster S")!)).not.toMatch(/~/);
  });
});
