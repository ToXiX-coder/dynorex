import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { notificationHref, isPublicPath } from "@/domain/deepLinks";
import {
  backwardsOdometer,
  buildSheetHtml,
  buildSheetText,
  complianceChoices,
  confirmBlock,
  evidence,
  isClaimCode,
  isCarbEo,
  nextPaperwork,
  normalizeClaimCode,
  recordStrip,
  recordSummary,
} from "@/domain/record";
import { modFormSchema } from "@/domain/validation/build";
import type { BuildRecord, RecordEntry } from "@/services/supabase/database.types";

/** D-64: the Build Record's rules on the phone (the database enforces the same ones). */
const base: RecordEntry = {
  type: "mod",
  id: "m1",
  title: "Coilovers",
  category: "suspension",
  brand: "Kessler",
  part_number: null,
  compliance: null,
  carb_eo: null,
  installed_by: "Apex Tuning",
  date: "2025-03-01",
  odometer: null,
  whp: null,
  wtq: null,
  dyno: null,
  correction: null,
  logged_at: "2025-03-02T10:00:00Z",
  removed_at: null,
  reopened: false,
  earlier_owner: false,
  has_sheet: false,
  version: 0,
  revisions: [],
  receipts: [],
  confirmation: null,
};
const e = (over: Partial<RecordEntry>): RecordEntry => ({ ...base, ...over });
const confirmed = {
  decision: "confirmed" as const,
  via: "link" as const,
  shop_name: "Apex Tuning",
  shop_city: "Denver",
  odometer: null,
  note: null,
  at: "2025-03-05T12:00:00Z",
  version: 0,
};

describe("evidence ladder", () => {
  it("climbs owner-entered, paperwork, part identified, shop-confirmed", () => {
    expect(evidence(base).level).toBe(0);
    const r = e({ receipts: [{ uploaded_at: "2025-03-02T10:00:00Z", sha256: null }] });
    expect(evidence(r)).toMatchObject({ level: 1, labels: ["Owner-entered", "Receipt uploaded Mar 2, 2025"] });
    expect(evidence(e({ type: "dyno", has_sheet: true })).level).toBe(1);
    expect(evidence({ ...r, part_number: "KS-1" }).level).toBe(2);
    const c = evidence({ ...r, confirmation: confirmed });
    expect(c.level).toBe(3);
    expect(c.labels).toContain("Confirmed by Apex Tuning, Denver (through a link) on Mar 5, 2025");
    expect(evidence(e({ earlier_owner: true })).labels[0]).toBe("Logged by an earlier owner");
  });

  it("flags edits after a confirmation, declines, late logging, removals and reopened mods", () => {
    const edited = evidence(
      e({ version: 1, revisions: [{ at: "2025-04-01T00:00:00Z", changed: ["brand"] }], confirmation: confirmed }),
    );
    expect(edited.level).toBe(0);
    expect(edited.flags.map((f) => f.id)).toEqual(["edited_after_confirmation"]);
    expect(edited.labels).toContain("Edited once, last on Apr 1, 2025");
    expect(evidence(e({ confirmation: { ...confirmed, decision: "declined" } })).flags[0]!.id).toBe("shop_declined");
    expect(evidence(e({ logged_at: "2026-03-01T00:00:00Z" })).flags[0]!.text).toBe("Logged 365 days after the work");
    const removed = evidence(e({ confirmation: confirmed, removed_at: "2025-06-01T00:00:00Z" }));
    expect(removed.level).toBe(0);
    expect(removed.flags[0]!.text).toBe("Removed by the owner on Jun 1, 2025");
    expect(evidence(e({ reopened: true })).flags[0]!.id).toBe("reopened");
  });

  it("flags a service mileage lower than an earlier one", () => {
    const list = [
      e({ id: "a", type: "maintenance", date: "2024-01-01", logged_at: "2024-01-01T18:00:00Z", odometer: 30000 }),
      e({ id: "b", type: "maintenance", date: "2024-06-01", logged_at: "2024-06-01T18:00:00Z", odometer: 25000 }),
      e({ id: "c", type: "maintenance", date: "2024-08-01", logged_at: "2024-08-01T18:00:00Z", odometer: 31000 }),
    ];
    expect([...backwardsOdometer(list)]).toEqual(["b"]);
    expect(recordSummary(list).flagged).toBe(1);
  });

  it("never calls anything verified", () => {
    const files = [
      "src/domain/record.ts",
      "src/features/record/RecordBits.tsx",
      "src/features/record/BuildRecordCard.tsx",
      "src/features/record/ShopInbox.tsx",
      "src/app/history/[token].tsx",
      "src/app/confirm/[token].tsx",
      "src/app/(tabs)/garage/[vehicleId]/record/index.tsx",
      "src/app/(tabs)/garage/[vehicleId]/record/[entryType]/[entryId].tsx",
      "src/app/(tabs)/garage/claim.tsx",
    ];
    for (const f of files) {
      const text = fs.readFileSync(path.resolve(import.meta.dirname, "../..", f), "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
      expect(text, f).not.toMatch(/["'`][^"'`]*\bverified\b/i);
    }
  });
});

describe("record at a glance (D-65)", () => {
  const strip = [
    e({ id: "a", date: "2025-05-01", confirmation: confirmed }),
    e({ id: "b", date: "2025-01-01" }),
    e({ id: "c", date: "2025-03-01", receipts: [{ uploaded_at: "2025-03-02T00:00:00Z", sha256: null }] }),
    e({ id: "d", date: "2025-02-01", removed_at: "2025-04-01T00:00:00Z" }),
  ];

  it("draws live entries oldest first, as the highest step each reached", () => {
    expect(recordStrip(strip)).toEqual([0, 1, 3]);
  });

  it("suggests paperwork for the newest bare mod or dyno run the owner can still change", () => {
    const entries = [
      e({ id: "old", date: "2025-01-01" }),
      e({ id: "new", date: "2025-06-01" }),
      e({ id: "backed", date: "2025-07-01", part_number: "K-100" }),
      e({ id: "theirs", date: "2025-08-01", earlier_owner: true }),
      e({ id: "gone", date: "2025-09-01", removed_at: "2025-09-02T00:00:00Z" }),
      e({ id: "undone", date: "2025-09-03", reopened: true }),
      e({ id: "service", type: "maintenance", date: "2025-10-01" }),
    ];
    expect(nextPaperwork(entries)?.id).toBe("new");
    expect(nextPaperwork([e({ id: "run", type: "dyno", date: "2025-02-01" })])?.id).toBe("run");
  });

  it("suggests nothing once everything has something behind it", () => {
    expect(nextPaperwork([e({ confirmation: confirmed }), e({ id: "x", has_sheet: true, type: "dyno" })])).toBeNull();
  });
});

describe("emissions rule", () => {
  it("never asks a shop about emissions parts without a CARB EO number", () => {
    expect(confirmBlock(base)).toBeNull();
    expect(confirmBlock(e({ category: "engine" }))).toBe("emissions");
    expect(confirmBlock(e({ category: "exhaust", compliance: "off_road_only" }))).toBe("emissions");
    expect(confirmBlock(e({ category: "engine", compliance: "carb_eo", carb_eo: "D-142-44" }))).toBeNull();
    expect(confirmBlock(e({ category: "exhaust", compliance: "stock" }))).toBeNull();
    expect(confirmBlock(e({ category: "electronics", compliance: "not_emissions_related" }))).toBeNull();
    expect(confirmBlock(e({ earlier_owner: true }))).toBe("earlier_owner");
    expect(confirmBlock(e({ type: "dyno" }))).toBe("dyno");
    expect(confirmBlock(e({ confirmation: confirmed }))).toBe("already_confirmed");
    expect(confirmBlock(e({ version: 1, confirmation: confirmed }))).toBeNull();
  });

  it("offers only fitting statuses, and the mod form keeps them honest", () => {
    expect(complianceChoices("wheels")).toEqual([]);
    expect(complianceChoices("engine")).not.toContain("not_emissions_related");
    expect(complianceChoices("electronics")).toContain("not_emissions_related");
    expect(isCarbEo(" d-142-44 ")).toBe(true);
    expect(isCarbEo("D-12")).toBe(false);

    const form = { name: "Intake", category: "engine", brand: "", part_number: "", cost: "", currency: "USD", status: "complete", notes: "", installed_on: "" };
    const ok = modFormSchema.safeParse({ ...form, compliance: "carb_eo", carb_eo: "d-142-44" });
    expect(ok.success && ok.data).toMatchObject({ compliance: "carb_eo", carb_eo: "D-142-44" });
    expect(modFormSchema.safeParse({ ...form, compliance: "carb_eo", carb_eo: "D-12" }).success).toBe(false);
    // a status that doesn't fit the category is dropped, not saved
    const wheels = modFormSchema.safeParse({ ...form, category: "wheels", compliance: "off_road_only", carb_eo: "D-1-1" });
    expect(wheels.success && wheels.data).toMatchObject({ compliance: null, carb_eo: null });
  });
});

describe("listing export", () => {
  const rec: BuildRecord = {
    car: { year: 2015, make: "Subaru", model: "WRX", trim: null },
    odometer: 61200,
    odometer_unit: "mi",
    owners: 2,
    owner_since: "2024-01-01T00:00:00Z",
    sold_at: null,
    entries: [
      e({ receipts: [{ uploaded_at: "2025-03-02T10:00:00Z", sha256: null }], confirmation: confirmed }),
      e({ id: "t", category: "engine", title: "Stage 1 <tune>", brand: "Arc", installed_by: "Self", date: "2025-05-01" }),
      e({ id: "x", removed_at: "2025-06-01T00:00:00Z" }),
    ],
  };
  it("lists live entries with their paperwork, flags and the buyer's link", () => {
    const text = buildSheetText(rec, "https://dynorex.app/history/abc");
    expect(text).toContain("2015 Subaru WRX: Build Record");
    expect(text).toContain("2 entries · 1 with paperwork · 1 shop-confirmed · 2 owners on Dynorex");
    expect(text).toContain("Mod: Kessler Coilovers · by Apex Tuning [receipt; shop-confirmed]");
    expect(text).toContain("by Self · Emissions status not recorded");
    expect(text).toContain("1 removed entry is shown on the live record.");
    expect(text).toContain("https://dynorex.app/history/abc");
    expect(text).not.toMatch(/verified/i);
  });
  it("escapes the PDF version", () => {
    expect(buildSheetHtml(rec, null)).toContain("Stage 1 &lt;tune&gt;");
  });
});

describe("codes, links and alerts", () => {
  it("tidies typed transfer codes", () => {
    expect(normalizeClaimCode(" hb3t 9wpz ")).toBe("HB3T-9WPZ");
    expect(isClaimCode("HB3T-9WPZ")).toBe(true);
    expect(isClaimCode("HB30-9WPZ")).toBe(false);
  });
  it("opens the shop's link without an account, and sends alerts to the right place", () => {
    expect(isPublicPath(`/confirm/${"a".repeat(64)}`)).toBe(true);
    expect(isPublicPath("/confirm/short")).toBe(false);
    const car = "d0000000-0000-4000-8000-000000000101";
    expect(notificationHref({ category: "record_confirm_request", entity_type: "business", entity_id: car })).toBe(
      "/paddock/business",
    );
    expect(notificationHref({ category: "record_confirm_answer", entity_type: "vehicle", entity_id: car })).toBe(
      `/garage/${car}/record`,
    );
  });
});
