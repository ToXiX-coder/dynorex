import { describe, expect, it } from "vitest";
import { buyerBrief } from "@/domain/buyerBrief";
import type { BuildRecord, RecordEntry } from "@/services/supabase/database.types";

/** D-76: what a buyer can read off the record before paying, and what it leaves them to ask. */
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
  date: "2026-03-01",
  odometer: null,
  whp: null,
  wtq: null,
  dyno: null,
  correction: null,
  logged_at: "2026-03-02T10:00:00Z",
  removed_at: null,
  reopened: false,
  earlier_owner: false,
  has_sheet: false,
  version: 0,
  revisions: [],
  receipts: [],
  confirmation: null,
};
let n = 0;
const e = (over: Partial<RecordEntry>): RecordEntry => ({ ...base, id: `e${++n}`, ...over });
const receipt = [{ uploaded_at: "2026-03-02T10:00:00Z", sha256: null }];
const confirmed = {
  decision: "confirmed" as const,
  via: "link" as const,
  shop_name: "Apex Tuning",
  shop_city: "Denver",
  odometer: null,
  note: null,
  at: "2026-03-05T12:00:00Z",
  version: 0,
};
const rec = (entries: RecordEntry[], kind: string | null = "car"): BuildRecord => ({
  car: { year: 2019, make: "Audi", model: "RS3", trim: null, kind },
  odometer: 42000,
  odometer_unit: "mi",
  owners: 1,
  owner_since: "2022-01-01T00:00:00Z",
  sold_at: null,
  entries,
});
const TODAY = "2026-11-12";
const ids = (r: BuildRecord) => buyerBrief(r, TODAY).asks.map((a) => a.id);

describe("buyerBrief facts", () => {
  it("says who did the work and how much of it a shop confirmed", () => {
    const b = buyerBrief(
      rec([
        e({ confirmation: confirmed, receipts: receipt }),
        e({ title: "Intake" }),
        e({ title: "Wheels", installed_by: "Self" }),
        e({ title: "Shift knob", installed_by: null }),
      ]),
      TODAY,
    );
    expect(b.facts[0]).toBe(
      "4 finished mods: 2 by a named shop (1 shop-confirmed), 1 by the owner, 1 doesn't say who.",
    );
    expect(b.facts[1]).toBe("1 of 4 mods has a receipt on file.");
  });

  it("leaves removed and reopened mods out of the counts", () => {
    const b = buyerBrief(rec([e({}), e({ removed_at: "2026-04-01T00:00:00Z" }), e({ reopened: true })]), TODAY);
    expect(b.facts[0]).toBe("1 finished mod: 1 by a named shop.");
  });

  it("names the newest service with its mileage", () => {
    const b = buyerBrief(
      rec([
        e({ type: "maintenance", title: "Oil change", date: "2026-01-10", odometer: 39000, category: null }),
        e({ type: "maintenance", title: "Brake fluid", date: "2026-08-02", odometer: 41500, category: null }),
      ]),
      TODAY,
    );
    expect(b.facts).toContain("2 services logged, newest: Brake fluid on Aug 2, 2026 at 41,500 mi.");
  });

  it("splits emissions-related parts by their status", () => {
    const b = buyerBrief(
      rec([
        e({ category: "exhaust", compliance: "carb_eo", carb_eo: "D-123-45" }),
        e({ category: "engine", compliance: "off_road_only" }),
        e({ category: "engine", compliance: "unknown" }),
        e({ category: "electronics", compliance: "not_emissions_related" }),
      ]),
      TODAY,
    );
    expect(b.facts).toContain(
      "3 emissions-related parts: 1 with a CARB EO number, 1 marked off-road only, 1 with no status.",
    );
  });

  it("shows an e-moto's newest battery check as the owner's reading, and no emissions line", () => {
    const b = buyerBrief(
      rec(
        [
          e({ category: "engine", compliance: "unknown" }),
          e({
            type: "maintenance",
            title: "Battery check",
            date: "2026-09-01",
            category: null,
            battery_cycles: 86,
            battery_full_v: 71.4,
          }),
        ],
        "ebike",
      ),
      TODAY,
    );
    expect(
      b.facts.some((f) => f.startsWith("Battery check Sep 1, 2026: 86 cycles") && f.includes("owner's reading")),
    ).toBe(true);
    expect(b.facts.some((f) => f.includes("emissions"))).toBe(false);
  });
});

describe("buyerBrief asks", () => {
  it("asks nothing about an empty record", () => {
    expect(buyerBrief(rec([]), TODAY)).toEqual({ facts: ["Nothing on the record yet."], asks: [] });
  });

  it("orders the asks: notes, shop invoices, receipts, emissions, service, stock parts", () => {
    const r = rec([
      e({ category: "engine", compliance: "unknown", logged_at: "2026-09-01T00:00:00Z" }),
      e({ title: "Wheels", installed_by: "Self" }),
    ]);
    expect(ids(r)).toEqual(["flagged", "unconfirmed_shop", "no_receipt", "emissions", "service", "stock_parts"]);
  });

  it("a well-backed record leaves only the stock parts question", () => {
    const r = rec([
      e({ confirmation: confirmed, receipts: receipt }),
      e({ type: "maintenance", title: "Oil change", date: "2026-08-02", category: null, receipts: receipt }),
    ]);
    expect(ids(r)).toEqual(["stock_parts"]);
    expect(buyerBrief(r, TODAY).asks[0]!.buyer).toBe("Ask whether the stock parts come with the car.");
  });

  it("doesn't ask for a receipt on work the shop itself confirmed", () => {
    const r = rec([e({ confirmation: confirmed }), e({ title: "Wheels", installed_by: "Self" })]);
    const ask = buyerBrief(r, TODAY).asks.find((x) => x.id === "no_receipt")!;
    expect(ask.buyer).toBe("1 mod has no receipt on file. Ask to see the receipts.");
  });

  it("flags a service gap of more than a year, dated from the newest service", () => {
    const r = rec([e({ type: "maintenance", title: "Oil change", date: "2025-06-01", category: null })]);
    const ask = buyerBrief(r, TODAY).asks.find((a) => a.id === "service")!;
    expect(ask.buyer).toBe("No service logged since Jun 1, 2025. Ask what's been done since.");
    expect(buyerBrief(r, "2026-05-01").asks.some((a) => a.id === "service")).toBe(false);
  });

  it("an e-moto with no battery reading gets the battery question, in e-moto words", () => {
    const r = rec(
      [e({ title: "Controller", category: "electronics", receipts: receipt, confirmation: confirmed })],
      "ebike",
    );
    const b = buyerBrief(r, TODAY);
    expect(b.asks.map((a) => a.id)).toEqual(["service", "battery", "stock_parts"]);
    expect(b.asks.at(-1)!.buyer).toBe("Ask whether the stock parts come with the e-moto.");
  });

  it("gives the seller their own wording for every ask, and never says verified", () => {
    const r = rec([e({ category: "engine", compliance: "unknown" })], "ebike");
    for (const a of buyerBrief(r, TODAY).asks) {
      expect(a.seller.length).toBeGreaterThan(10);
      expect(a.seller).not.toBe(a.buyer);
      expect(`${a.buyer} ${a.seller}`).not.toMatch(/verified|certified|guarantee/i);
    }
  });
});
