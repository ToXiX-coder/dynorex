import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fillBaseline, matchStockSpec, squash, STOCK_SPECS } from "@/domain/stockSpecs";

const sqlRow = (s: (typeof STOCK_SPECS)[number]) => {
  const q = (x: string) => `'${x.replace(/'/g, "''")}'`;
  const arr = (a: string[]) => `array[${a.map((x) => q(squash(x))).join(", ")}]::text[]`;
  const n = (v: number | null) => (v === null ? "null" : String(v));
  return `(${q(s.make)}, ${arr(s.names)}, ${arr(s.except ?? [])}, ${s.from}, ${s.to}, ${q(s.label)}, ${s.hp}, ${s.torque_lbft}, ${n(s.weight_lb)}, ${n(s.zero_to_sixty_s)})`;
};

describe("factory stock specs", () => {
  it("the database has exactly the app's rows", () => {
    const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261017000000_stock_specs.sql"), "utf8");
    for (const s of STOCK_SPECS) expect(sql, s.label).toContain(sqlRow(s));
    expect(sql.match(/^\s+\('/gm)?.length).toBe(STOCK_SPECS.length);
  });

  it("every row is sane: real ranges, positive numbers, plausible 0–60", () => {
    for (const s of STOCK_SPECS) {
      expect(s.to, s.label).toBeGreaterThanOrEqual(s.from);
      expect(s.hp).toBeGreaterThan(50);
      expect(s.torque_lbft).toBeGreaterThan(50);
      if (s.weight_lb !== null) expect(s.weight_lb).toBeGreaterThan(1500);
      if (s.zero_to_sixty_s !== null) expect(s.zero_to_sixty_s).toBeGreaterThan(2);
    }
  });

  it("matches the way people type cars", () => {
    const label = (year: number, make: string, model: string, trim: string | null = null) =>
      matchStockSpec({ year, make, model, trim })?.label ?? null;
    expect(label(2015, "Subaru", "WRX")).toBe("Subaru WRX");
    expect(label(2015, "Subaru", "WRX STI")).toBe("Subaru WRX STI"); // longest name wins
    expect(label(2015, "Subaru", "Impreza", "WRX STI Limited")).toBe("Subaru WRX STI");
    expect(label(1999, "Mazda", "Miata")).toBe("Mazda MX-5 Miata (NB)");
    expect(label(2019, "Mazda", "MX5")).toBe("Mazda MX-5 Miata (ND2)");
    expect(label(2017, "Ford", "Mustang", "GT Premium")).toBe("Ford Mustang GT");
    expect(label(2016, "Chevy", "Corvette")).toBe("Chevrolet Corvette Stingray (C7)");
  });

  it("never guesses: unknown cars, wrong years and faster variants get nothing", () => {
    expect(matchStockSpec({ year: 2018, make: "Honda", model: "Civic" })).toBeNull();
    expect(matchStockSpec({ year: 2014, make: "Subaru", model: "WRX" })).toBeNull(); // previous generation not on file
    expect(matchStockSpec({ year: 2017, make: "Chevrolet", model: "Corvette", trim: "Z06" })).toBeNull();
    expect(matchStockSpec({ year: 2017, make: "Ford", model: "Mustang", trim: "Shelby GT350" })).toBeNull();
    expect(matchStockSpec({ year: 2022, make: "Ford", model: "Bronco Sport" })).toBeNull();
    expect(matchStockSpec({ year: 1986, make: "Toyota", model: "Corolla", trim: "DX" })).toBeNull();
  });

  it("fills only the blanks, and says where each number came from", () => {
    const f = fillBaseline({ year: 2015, make: "Subaru", model: "WRX", baseline_hp: 280 });
    expect(f.values).toEqual({
      baseline_hp: 280,
      baseline_torque_lbft: 258,
      baseline_weight_lb: 3267,
      baseline_zero_to_sixty_s: 5.4,
    });
    expect(f.baseline_looked_up).toEqual(["baseline_torque_lbft", "baseline_weight_lb", "baseline_zero_to_sixty_s"]);
    expect(f.baseline_source).toBe("user_reported");
    expect(f.baseline_lookup_label).toBe("2015–2021 Subaru WRX");
    const none = fillBaseline({ year: 2018, make: "Honda", model: "Civic" });
    expect(none).toMatchObject({ baseline_looked_up: [], baseline_source: null, baseline_lookup_label: null });
  });
});
