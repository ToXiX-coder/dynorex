import { describe, expect, it } from "vitest";
import {
  brandOptions,
  categoryForModName,
  filterOptions,
  makeOptions,
  modNameOptions,
  yearOptions,
} from "@/domain/catalog";
import { MOD_CATEGORIES } from "@/domain/validation/build";

describe("form pick-lists", () => {
  it("years run from next model year back to 1950", () => {
    const ys = yearOptions(new Date("2026-10-07"));
    expect(ys[0]!.value).toBe("2027");
    expect(ys.at(-1)!.value).toBe("1950");
  });

  it("every mod category has common mods and brands", () => {
    for (const { id } of MOD_CATEGORIES) {
      expect(modNameOptions(id).length, id).toBeGreaterThan(3);
      expect(brandOptions(id).length, id).toBeGreaterThan(3);
    }
  });

  it("picking a common mod tells us its category; unknown names don't", () => {
    expect(categoryForModName("downpipe")).toBe("exhaust");
    expect(categoryForModName("Coilovers")).toBe("suspension");
    expect(categoryForModName("My custom widget")).toBeNull();
  });

  it("brands for the chosen category come first, then everyone else, no duplicates", () => {
    const b = brandOptions("exhaust").map((o) => o.value);
    expect(b.slice(0, 3)).toEqual(["Akrapovič", "Borla", "Corsa"]);
    expect(new Set(b).size).toBe(b.length);
    expect(b).toContain("Brembo"); // other categories still reachable
  });

  it("search puts starts-with matches first", () => {
    const hits = filterOptions(modNameOptions(null), "tur").map((o) => o.value);
    expect(hits[0]).toBe("Turbo upgrade");
    expect(filterOptions(modNameOptions("engine"), "").length).toBe(modNameOptions("engine").length);
  });

  it("popular makes are listed first and never duplicated by the national list", () => {
    const opts = makeOptions([{ name: "SUBARU" }, { name: "Subaru" }, { name: "Zenvo" }]);
    expect(opts[0]!.value).toBe("Acura");
    expect(opts.filter((o) => o.value.toLowerCase() === "subaru")).toHaveLength(1);
    expect(opts.at(-1)!.value).toBe("Zenvo");
    expect(makeOptions(null).length).toBeGreaterThan(30); // works when the national list can't load
  });
});
