import { describe, expect, it } from "vitest";
import { catalogModels, inRanges } from "@/domain/modelCatalog";

describe("shipped model catalog", () => {
  it("reads year ranges", () => {
    expect(inRanges("2013-2015,2017", 2014)).toBe(true);
    expect(inRanges("2013-2015,2017", 2016)).toBe(false);
    expect(inRanges("2013-2015,2017", 2017)).toBe(true);
    expect(inRanges("1999", 1999)).toBe(true);
  });

  it("lists only that year's models, matching the make in any case", () => {
    const fake = new Map([["subaru", { BRZ: "2013-2020,2022-2027", Baja: "2003-2006", WRX: "2015-2027" }]]);
    expect(catalogModels("SUBARU", 2016, fake)).toEqual(["BRZ", "WRX"]);
    expect(catalogModels("Subaru", 2004, fake)).toEqual(["Baja"]);
    expect(catalogModels("Subaru", 2021, fake)).toEqual(["WRX"]);
    expect(catalogModels("Nope", 2016, fake)).toEqual([]);
  });

  it("ships real models for common cars", () => {
    expect(catalogModels("Subaru", 2016)).toContain("WRX");
    expect(catalogModels("Mazda", 1999)).toContain("MX-5 Miata");
    expect(catalogModels("Ford", 2020)).toContain("Mustang");
  });
});
