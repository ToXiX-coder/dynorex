import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSheetHtml, buildSheetText } from "@/domain/buildSheet";
import { normalizeClaimCode, isClaimCode } from "@/domain/codes";
import { complianceChoices, confirmBlock, isCarbEo } from "@/domain/compliance";
import { evidence, summary } from "@/domain/evidence";
import { backwardsEntries } from "@/domain/odometer";
import type { Entry, PublicRecord } from "@/domain/types";
import { isVinShape, vinCheckDigitOk } from "@/domain/vin";

const base: Entry = {
  id: "e1",
  carId: "c1",
  kind: "install",
  category: "suspension",
  title: "Coilovers",
  partBrand: "KW",
  partNumber: null,
  carbEo: null,
  compliance: "not_emissions_related",
  installerType: "shop",
  installerName: "Apex Tuning",
  performedOn: "2025-03-01",
  odometer: 41000,
  odometerUnit: "mi",
  costCents: null,
  notes: null,
  dynoWhp: null,
  dynoWtq: null,
  rev: 1,
  createdAt: "2025-03-02T10:00:00Z",
  withdrawnAt: null,
  withdrawReason: null,
  receipts: [],
  confirmation: null,
  revisions: [],
};
const e = (over: Partial<Entry>): Entry => ({ ...base, ...over });
const confirmed = { decision: "confirmed" as const, shopName: "Apex Tuning", shopCity: "Denver", odometer: null, note: null, at: "2025-03-05T00:00:00Z", rev: 1 };

describe("evidence", () => {
  it("climbs owner-entered → receipt → part identified → shop-confirmed", () => {
    expect(evidence(base).level).toBe(0);
    const r = e({ receipts: [{ id: "r", kind: "receipt", uploadedAt: "2025-03-02T10:00:00Z", sha256: null }] });
    expect(evidence(r)).toMatchObject({ level: 1, labels: ["Owner-entered", "Receipt uploaded Mar 2, 2025"] });
    expect(evidence({ ...r, partNumber: "35220089" }).level).toBe(2);
    const sheet = e({ kind: "dyno", receipts: [{ id: "d", kind: "dyno_sheet", uploadedAt: "2025-03-02T10:00:00Z", sha256: null }] });
    expect(evidence(sheet)).toMatchObject({ level: 1, labels: ["Owner-entered", "Dyno sheet uploaded Mar 2, 2025"] });
    const c = evidence({ ...r, confirmation: confirmed });
    expect(c.level).toBe(3);
    expect(c.labels).toContain("Confirmed by Apex Tuning, Denver on Mar 5, 2025");
  });

  it("flags edits after confirmation, declines, late logging and withdrawals", () => {
    expect(evidence(e({ rev: 2, confirmation: confirmed }))).toMatchObject({
      level: 0,
      flags: [{ id: "edited_after_confirmation" }],
    });
    expect(evidence(e({ confirmation: { ...confirmed, decision: "declined" } })).flags[0]!.id).toBe("shop_declined");
    expect(evidence(e({ createdAt: "2026-03-01T00:00:00Z" })).flags[0]!.text).toBe("Logged 365 days after the work");
    const w = evidence(e({ confirmation: confirmed, withdrawnAt: "2025-04-01T00:00:00Z", withdrawReason: "Wrong car" }));
    expect(w.level).toBe(0);
    expect(w.flags[0]!.text).toBe("Withdrawn: Wrong car");
  });

  it("never says verified anywhere in the app's own words", () => {
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)],
      );
    const src = path.resolve(import.meta.dirname, "../src");
    for (const f of files(src)) {
      const text = fs.readFileSync(f, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
      expect(text, f).not.toMatch(/[\"'`][^\"'`]*\bverified\b/i);
    }
  });
});

describe("emissions-safe shop confirmation", () => {
  it("is offered for non-emissions shop work, CARB EO parts and return to stock only", () => {
    expect(confirmBlock(base)).toBeNull();
    expect(confirmBlock(e({ installerType: "owner", installerName: null }))).toBe("not_shop");
    expect(confirmBlock(e({ category: "tune", compliance: "unknown" }))).toBe("emissions");
    expect(confirmBlock(e({ category: "exhaust", compliance: "off_road_only" }))).toBe("emissions");
    expect(confirmBlock(e({ category: "intake", compliance: "carb_eo", carbEo: "D-142-44" }))).toBeNull();
    expect(confirmBlock(e({ kind: "return_to_stock", category: "tune", compliance: "unknown" }))).toBeNull();
    expect(confirmBlock(e({ confirmation: confirmed }))).toBe("already_confirmed");
    expect(confirmBlock(e({ rev: 2, confirmation: confirmed }))).toBeNull();
  });

  it("checks CARB EO numbers and offers only fitting compliance choices", () => {
    expect(isCarbEo(" d-142-44 ")).toBe(true);
    expect(isCarbEo("D-12")).toBe(false);
    expect(complianceChoices("wheels_tires")).toEqual(["not_emissions_related"]);
    expect(complianceChoices("tune")).toEqual(["carb_eo", "off_road_only", "unknown"]);
  });
});

describe("odometer", () => {
  it("flags a reading lower than an earlier one, converting km", () => {
    const list = [
      e({ id: "a", performedOn: "2024-01-01", odometer: 30000 }),
      e({ id: "b", performedOn: "2024-06-01", odometer: 25000 }),
      e({ id: "c", performedOn: "2024-07-01", odometer: 48500, odometerUnit: "km" }), // 30,136 mi
      e({ id: "d", performedOn: "2024-08-01", odometer: 31000 }),
    ];
    expect([...backwardsEntries(list)]).toEqual(["b"]);
  });
});

describe("listing export", () => {
  const rec: PublicRecord = {
    car: { year: 2016, make: "Subaru", model: "WRX", trim: null },
    ownerSince: "2024-01-01T00:00:00Z",
    owners: 2,
    entries: [
      e({ receipts: [{ id: "r", kind: "receipt", uploadedAt: "2025-03-02T10:00:00Z", sha256: null }], confirmation: confirmed }),
      e({ id: "t", category: "tune", compliance: "unknown", title: "Stage 1 <tune>", partBrand: "Cobb", installerType: "owner", installerName: null, performedOn: "2025-05-01" }),
      e({ id: "w", withdrawnAt: "2025-06-01T00:00:00Z" }),
    ],
  };

  it("lists live entries with their evidence and the link, and counts withdrawn ones", () => {
    const text = buildSheetText(rec, "https://buildmark.app/r/abc");
    expect(text).toContain("2016 Subaru WRX: build record");
    expect(text).toContain("2 entries · 1 with receipts · 1 shop-confirmed · 2 owners on Buildmark");
    expect(text).toContain("Installed: KW Coilovers (Suspension) · by Apex Tuning [receipt; shop-confirmed]");
    expect(text).toContain("by owner · Emissions status not recorded");
    expect(text).toContain("1 withdrawn entry is shown on the live record.");
    expect(text).toContain("https://buildmark.app/r/abc");
    expect(summary(rec.entries).entries).toBe(2);
  });

  it("escapes the PDF version", () => {
    const html = buildSheetHtml(rec, null);
    expect(html).toContain("Stage 1 &lt;tune&gt;");
    expect(html).not.toContain("<tune>");
  });
});

describe("codes and VINs", () => {
  it("tidies typed transfer codes", () => {
    expect(normalizeClaimCode(" abcd efgh ")).toBe("ABCD-EFGH");
    expect(isClaimCode("ABCD-EFGH")).toBe(true);
    expect(isClaimCode("ABC0-EFGH")).toBe(false);
  });

  it("checks VIN shape and the North American check digit", () => {
    expect(isVinShape("1M8GDM9AXKP042788")).toBe(true);
    expect(vinCheckDigitOk("1M8GDM9AXKP042788")).toBe(true);
    expect(vinCheckDigitOk("1M8GDM9A1KP042788")).toBe(false);
    expect(isVinShape("1M8GDM9AXKP04278O")).toBe(false);
  });
});
