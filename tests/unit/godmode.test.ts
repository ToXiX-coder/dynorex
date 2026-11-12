import { describe, expect, it } from "vitest";
import { serviceIcs } from "@/domain/calendar";
import { latestPerJob } from "@/domain/maintenance";
import { budgetStatus } from "@/domain/money";
import { qrSvg } from "@/domain/qrSvg";
import { buildSheetHtml, listingAdText } from "@/domain/record";
import { modFormSchema } from "@/domain/validation/build";
import { dayText, localToday } from "@/domain/when";
import { buildWrapped, type WrappedInput } from "@/domain/wrapped";
import { fillFromReceipt } from "@/features/mods/receiptFill";
import type { ModFields } from "@/features/mods/ModFormView";
import { readDecodedVin } from "@/services/nhtsa";
import type { BuildRecord, MaintenanceRecord, RecordEntry } from "@/services/supabase/database.types";
import { cleanReceipt } from "../../supabase/functions/_shared/receipt";

/** D-68: the god mode round's fixes and features. */

// a blank Add mod form, as fieldsFromMod(null) makes it
const blankForm: ModFields = {
  name: "",
  category: "",
  brand: "",
  part_number: "",
  cost: "",
  currency: "USD",
  status: "planned",
  notes: "",
  installed_on: "",
  installed_by: "",
  installed_odometer: "",
  compliance: "",
  carb_eo: "",
  sets_motor_kw: "",
  sets_battery_v: "",
  sets_battery_wh: "",
};

describe("dates", () => {
  it("shows days the way the rest of the app does, on their own day", () => {
    const now = new Date(2026, 9, 25, 23, 30);
    expect(dayText("2026-10-23", now)).toBe(
      new Date(2026, 9, 23).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    );
    expect(dayText("2025-03-01", now)).toContain("2025");
    expect(dayText("not a date", now)).toBe("");
  });

  it("uses the phone's own calendar for today, not UTC", () => {
    expect(localToday(new Date(2026, 9, 25, 23, 59))).toBe("2026-10-25");
    expect(localToday(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });
});

describe("mileage at install", () => {
  const base = { ...blankForm, name: "Coilovers", category: "suspension" };
  it("takes commas, clears blanks and refuses nonsense", () => {
    const ok = modFormSchema.safeParse({ ...base, installed_odometer: "61,900" });
    expect(ok.success && ok.data.installed_odometer).toBe(61900);
    const blank = modFormSchema.safeParse({ ...base, installed_odometer: "" });
    expect(blank.success && blank.data.installed_odometer).toBeNull();
    expect(modFormSchema.safeParse({ ...base, installed_odometer: "12.5" }).success).toBe(false);
    expect(modFormSchema.safeParse({ ...base, installed_odometer: "3000000" }).success).toBe(false);
  });
});

describe("build budget", () => {
  it("says what's left, and when planned mods take it over", () => {
    expect(budgetStatus(800000, 389899, 279900)).toMatchObject({ left: 130201, over: false });
    const over = budgetStatus(100000, 90000, 30000);
    expect(over).toMatchObject({ left: -20000, over: true, spentShare: 0.9 });
    expect(over.spentShare + over.plannedShare).toBeLessThanOrEqual(1);
  });
});

describe("maintenance", () => {
  const rec = (over: Partial<MaintenanceRecord>): MaintenanceRecord => ({
    id: "r",
    owner_id: "o",
    vehicle_id: "v",
    title: "Oil change",
    done_on: "2026-01-01",
    odometer: null,
    cost_minor: null,
    currency: "USD",
    notes: null,
    next_due_on: null,
    next_due_odometer: null,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...over,
  });

  it("offers Log again on the newest record of each job only", () => {
    const list = [
      rec({ id: "a", done_on: "2026-01-01" }),
      rec({ id: "b", done_on: "2026-07-01", title: "oil change " }),
      rec({ id: "c", title: "Tire rotation" }),
    ];
    expect(latestPerJob(list).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("makes an all-day calendar entry with the mileage, and no link or owner", () => {
    const ics = serviceIcs({
      id: "r1",
      title: "Oil change",
      car: "Weekend Warrior",
      due_on: "2026-12-31",
      due_miles: 65000,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
    expect(ics).toContain("65\\,000 mi");
    expect(ics).toContain("UID:maintenance-r1@dynorex.app");
    expect(ics).not.toContain("URL:");
  });
});

describe("sale kit", () => {
  const entry = (over: Partial<RecordEntry>): RecordEntry => ({
    type: "mod",
    id: "m",
    title: "Coilovers",
    category: "suspension",
    brand: "BC Racing",
    part_number: "F-11",
    compliance: null,
    carb_eo: null,
    installed_by: "Apex Tuning",
    date: "2026-08-01",
    odometer: 61900,
    whp: null,
    wtq: null,
    dyno: null,
    correction: null,
    logged_at: "2026-08-02T00:00:00Z",
    removed_at: null,
    reopened: false,
    earlier_owner: false,
    has_sheet: false,
    version: 0,
    revisions: [],
    receipts: [{ uploaded_at: "2026-08-02T00:00:00Z", sha256: null }],
    confirmation: null,
    ...over,
  });
  const rec: BuildRecord = {
    car: { year: 2015, make: "Subaru", model: "WRX", trim: "Premium" },
    odometer: 62450,
    odometer_unit: "mi",
    owners: 1,
    owner_since: "2024-01-01T00:00:00Z",
    sold_at: null,
    entries: [
      entry({}),
      entry({
        id: "s",
        type: "maintenance",
        title: "Oil change",
        brand: null,
        category: null,
        receipts: [],
        installed_by: null,
      }),
      entry({ id: "x", title: "Removed thing", removed_at: "2026-09-01T00:00:00Z" }),
    ],
  };
  const link = "https://dynorex.app/history/abc";

  it("writes a short ad from the record only, with the buyer's link", () => {
    const ad = listingAdText(rec, link);
    expect(ad.split("\n")[0]).toBe("2015 Subaru WRX Premium · 62,450 mi");
    expect(ad).toContain("- BC Racing Coilovers, fitted by Apex Tuning (receipt)");
    expect(ad).toContain("Service: Oil change");
    expect(ad).not.toContain("Removed thing");
    expect(ad).toContain(link);
    expect(ad).not.toMatch(/verified|\$/i);
  });

  it("puts the QR code on the for-sale sheet only with a link", () => {
    const qr = qrSvg(link);
    expect(qr.startsWith("<svg")).toBe(true);
    expect(buildSheetHtml(rec, link, qr)).toContain("<figure><svg");
    expect(buildSheetHtml(rec, null, qr)).not.toContain("<figure>");
    expect(buildSheetHtml(rec, link, qr)).toContain("For sale");
  });
});

describe("Build Wrapped", () => {
  const input: WrappedInput = {
    year: 2026,
    cars: [
      { id: "a", sold: false },
      { id: "b", sold: true },
    ],
    mods: [
      {
        vehicle_id: "a",
        name: "Intake",
        category: "engine",
        status: "complete",
        installed_on: "2026-03-01",
        status_changed_at: "2026-03-01T00:00:00Z",
        spec_deltas: { hp: { delta: 10, unit: "hp" } },
        installed_odometer: 60000,
      },
      {
        vehicle_id: "a",
        name: "Tune",
        category: "engine",
        status: "complete",
        installed_on: "2026-07-10",
        status_changed_at: "2026-07-10T00:00:00Z",
        spec_deltas: { hp: { delta: 20, unit: "kw" } },
        installed_odometer: 62000,
      },
      {
        vehicle_id: "a",
        name: "Wheels",
        category: "wheels",
        status: "complete",
        installed_on: "2026-07-20",
        status_changed_at: "2026-07-20T00:00:00Z",
        spec_deltas: {},
      },
      {
        vehicle_id: "a",
        name: "Old",
        category: "aero",
        status: "complete",
        installed_on: "2025-05-01",
        status_changed_at: "2025-05-01T00:00:00Z",
        spec_deltas: {},
      },
      {
        vehicle_id: "a",
        name: "Plan",
        category: "aero",
        status: "planned",
        installed_on: null,
        status_changed_at: "2026-02-01T00:00:00Z",
        spec_deltas: {},
      },
      {
        vehicle_id: "a",
        name: "Theirs",
        category: "engine",
        status: "complete",
        installed_on: "2026-01-01",
        status_changed_at: "2026-01-01T00:00:00Z",
        spec_deltas: {},
        inherited_at: "2026-01-02T00:00:00Z",
      },
    ],
    services: [{ vehicle_id: "a", done_on: "2026-07-01", odometer: 61000 }],
    runs: 3,
    meets: null,
  };

  it("counts only the owner's own year", () => {
    const w = buildWrapped(input);
    expect(w).toMatchObject({
      cars: 1,
      modsFinished: 3,
      services: 1,
      runs: 3,
      meets: null,
      newestMod: "Wheels",
      empty: false,
    });
    expect(w.hpAdded).toBe(37); // 10 hp + 20 kW, the owner's own numbers
    expect(w.miles).toBe(2000);
    expect(w.topCategory).toEqual({ label: "Engine", count: 2 });
    expect(w.busiestMonth).toBe("July");
  });

  it("claims no lead on a tie, and says when there's nothing yet", () => {
    const tie = buildWrapped({ ...input, mods: input.mods.slice(1, 3) });
    expect(tie.topCategory).toBeNull();
    // runs come in already counted for the year
    expect(buildWrapped({ ...input, year: 2024, runs: 0 }).empty).toBe(true);
  });
});

describe("receipt scan", () => {
  const today = new Date("2026-10-25T12:00:00Z");
  it("keeps only what checks out", () => {
    expect(cleanReceipt({ is_receipt: false, part: "x" }, today)).toBeNull();
    expect(cleanReceipt("nope", today)).toBeNull();
    const r = cleanReceipt(
      {
        is_receipt: true,
        part: "  Coilovers  ",
        brand: "BC Racing",
        part_number: "F-11-BR",
        total: 1195.004,
        currency: "usd",
        date: "2026-10-20",
        shop: "Apex",
      },
      today,
    );
    expect(r).toEqual({
      part: "Coilovers",
      brand: "BC Racing",
      part_number: "F-11-BR",
      total: 1195,
      currency: "USD",
      date: "2026-10-20",
      shop: "Apex",
    });
    const odd = cleanReceipt(
      { is_receipt: true, part: "Exhaust", total: -5, currency: "BTC", date: "2027-01-01" },
      today,
    );
    expect(odd).toMatchObject({ part: "Exhaust", total: null, currency: null, date: null });
  });

  it("fills only blank fields, and the category follows the part", () => {
    const typed = { ...blankForm, brand: "My brand" };
    const out = fillFromReceipt(typed, {
      part: "Coilovers",
      brand: "BC Racing",
      part_number: "F-11-BR",
      total: 1195,
      currency: "JPY",
      date: "2026-10-20",
      shop: "Apex",
    });
    expect(out.fields).toMatchObject({
      name: "Coilovers",
      brand: "My brand",
      cost: "1195",
      currency: "JPY",
      installed_on: "2026-10-20",
      installed_by: "Apex",
    });
    expect(out.fields.category).toBe("suspension");
    expect(out.filled).toEqual(["name", "part number", "cost", "date", "fitted by"]);
  });
});

describe("VIN fill-in", () => {
  it("reads NHTSA's answer, or nothing when it can't name the car", () => {
    expect(readDecodedVin({ ModelYear: "2015", Make: "SUBARU", Model: "WRX", Trim: "Premium" })).toEqual({
      year: 2015,
      make: "Subaru",
      model: "WRX",
      trim: "Premium",
    });
    expect(
      readDecodedVin({ ModelYear: "2016", Make: "SUBARU", Model: "WRX", Trim: "", Series: "KA" })?.trim,
    ).toBeNull();
    expect(readDecodedVin({ ModelYear: "", Make: "", Model: "" })).toBeNull();
    expect(readDecodedVin(undefined)).toBeNull();
  });
});
