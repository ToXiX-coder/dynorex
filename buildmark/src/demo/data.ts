import type { Car, Confirmation, Entry, Receipt } from "@/domain/types";

/**
 * Sample data for demos. Brands, shops and CARB EO numbers are made up on purpose, so nothing here reads as a
 * claim about a real product or business.
 */

export const DEMO_SHARE_TOKEN = "5a3c".repeat(16);
export const DEMO_SHOP_TOKEN = "c0de".repeat(16);
/** A car someone is selling to you: claim it with this code and VIN from the Claim screen. */
export const DEMO_CLAIM = { code: "HB3T-9WPZ", vin: "JM1NC2PF0E0234567" };

export interface DemoCar extends Car {
  owners: number;
  ownerSince: string;
  shareToken: string | null;
  transferExpires: string | null;
}

const receipt = (id: string, uploadedAt: string, kind: Receipt["kind"] = "receipt"): Receipt => ({
  id,
  kind,
  uploadedAt,
  sha256: (id.charCodeAt(id.length - 1) % 16).toString(16).repeat(64),
});
const confirm = (shopName: string, at: string, rev = 1, odometer: number | null = null): Confirmation => ({
  decision: "confirmed",
  shopName,
  shopCity: "Boulder, CO",
  odometer,
  note: null,
  at,
  rev,
});

let n = 0;
function entry(carId: string, e: Partial<Entry> & Pick<Entry, "kind" | "category" | "title" | "performedOn" | "createdAt">): Entry {
  n += 1;
  return {
    id: `demo-e${n}`,
    carId,
    partBrand: null,
    partNumber: null,
    carbEo: null,
    compliance: "not_emissions_related",
    installerType: "owner",
    installerName: null,
    odometer: null,
    odometerUnit: "mi",
    costCents: null,
    notes: null,
    dynoWhp: null,
    dynoWtq: null,
    rev: 1,
    withdrawnAt: null,
    withdrawReason: null,
    receipts: [],
    confirmation: null,
    revisions: [],
    ...e,
  };
}

export function seed() {
  n = 0;
  const wrx = "demo-wrx";
  const mx5 = "demo-mx5";
  const cars: DemoCar[] = [
    {
      id: wrx, year: 2016, make: "Subaru", model: "WRX", trim: "Premium", nickname: "Blue", vin: "JF1VA1C60G9812345",
      archived: false, owners: 2, ownerSince: "2024-06-14T15:00:00Z", shareToken: DEMO_SHARE_TOKEN, transferExpires: null,
    },
    {
      id: mx5, year: 2008, make: "Mazda", model: "MX-5", trim: "Touring", nickname: null, vin: null,
      archived: true, owners: 2, ownerSince: "2023-11-02T15:00:00Z", shareToken: null, transferExpires: null,
    },
  ];
  const shop = { installerType: "shop" as const, installerName: "Rallysport Garage" };
  const entries: Entry[] = [
    // the previous owner's era
    entry(wrx, {
      kind: "install", category: "suspension", title: "Coilovers", partBrand: "Kessler", partNumber: "KS-2210-V1",
      performedOn: "2021-04-10", odometer: 18200, costCents: 180000, createdAt: "2021-04-11T18:00:00Z", ...shop,
      receipts: [receipt("r1", "2021-04-11T18:02:00Z")], confirmation: confirm("Rallysport Garage", "2021-04-13T16:00:00Z", 1, 18205),
    }),
    entry(wrx, {
      kind: "install", category: "intake", title: "Cold air intake", partBrand: "Northline", partNumber: "NL-CAI-15",
      compliance: "carb_eo", carbEo: "D-9001-1", performedOn: "2022-03-15", odometer: 27400, costCents: 42000,
      createdAt: "2022-03-15T21:00:00Z", receipts: [receipt("r2", "2022-03-15T21:01:00Z")],
    }),
    entry(wrx, {
      kind: "install", category: "tune", title: "Stage 1 tune", partBrand: "Arcflash", compliance: "unknown",
      performedOn: "2022-03-15", odometer: 27400, createdAt: "2022-03-15T21:05:00Z",
      notes: "Flashed at home.",
    }),
    entry(wrx, {
      kind: "dyno", category: "tune", title: "Dyno after tune", compliance: "unknown", performedOn: "2023-05-20",
      odometer: 34100, dynoWhp: 268, dynoWtq: 291, installerType: "shop", installerName: "Front Range Dyno",
      createdAt: "2023-05-21T17:00:00Z", receipts: [receipt("r3", "2023-05-21T17:02:00Z", "dyno_sheet")],
    }),
    // the current owner's era
    entry(wrx, {
      kind: "service", category: "drivetrain", title: "Clutch and gear oil service", performedOn: "2024-08-03",
      odometer: 38050, costCents: 31000, createdAt: "2024-08-04T15:00:00Z", rev: 2, ...shop,
      receipts: [receipt("r4", "2024-08-04T15:01:00Z")], confirmation: confirm("Rallysport Garage", "2024-08-06T15:00:00Z", 1),
      revisions: [{ rev: 1, at: "2024-09-01T12:00:00Z", reason: "Added the cost", changed: ["cost_cents"] }],
    }),
    entry(wrx, {
      kind: "return_to_stock", category: "tune", title: "Reflashed to the factory map", compliance: "unknown",
      performedOn: "2025-02-10", odometer: 41300, createdAt: "2025-02-10T23:00:00Z", ...shop,
      confirmation: confirm("Rallysport Garage", "2025-02-12T16:30:00Z", 1, 41302),
    }),
    entry(wrx, {
      kind: "install", category: "wheels_tires", title: "17x9 wheels and summer tires", partBrand: "Ridgeway",
      performedOn: "2025-03-01", odometer: 41800, costCents: 210000, createdAt: "2025-09-01T19:00:00Z",
      receipts: [receipt("r5", "2025-09-01T19:01:00Z")],
    }),
    entry(wrx, {
      kind: "install", category: "brakes", title: "Big brake kit", partBrand: "Stoppel", performedOn: "2025-04-02",
      odometer: 42300, createdAt: "2025-04-03T12:00:00Z", withdrawnAt: "2025-04-05T09:00:00Z",
      withdrawReason: "Logged on the wrong car",
    }),
    entry(wrx, {
      kind: "install", category: "brakes", title: "Brake pads and stainless lines", partBrand: "Stoppel",
      partNumber: "SP-44-WRX", performedOn: "2025-05-18", odometer: 43150, costCents: 64000,
      createdAt: "2025-05-18T20:00:00Z", ...shop, receipts: [receipt("r6", "2025-05-18T20:01:00Z")],
    }),
    // a car the demo owner sold: a read-only copy of what was logged until the sale
    entry(mx5, {
      kind: "install", category: "suspension", title: "Sway bars", partBrand: "Kessler", performedOn: "2022-06-01",
      odometer: 61000, createdAt: "2022-06-02T12:00:00Z", receipts: [receipt("r7", "2022-06-02T12:00:00Z")],
    }),
    entry(mx5, {
      kind: "service", category: "other", title: "Timing belt and water pump", performedOn: "2023-04-11",
      odometer: 68900, createdAt: "2023-04-12T12:00:00Z", installerType: "shop", installerName: "Pinecrest Auto",
    }),
  ];
  const shopLinks: Record<string, { entryId: string; rev: number; closed: boolean }> = {
    [DEMO_SHOP_TOKEN]: { entryId: entries.find((e) => e.title.startsWith("Brake pads"))!.id, rev: 1, closed: false },
  };
  return { cars, entries, shopLinks };
}

/** The car waiting to be claimed with DEMO_CLAIM. */
export function claimableCar(): { car: DemoCar; entries: Entry[] } {
  const id = "demo-claimed";
  return {
    car: {
      id, year: 2014, make: "Mazda", model: "MX-5", trim: "Club", nickname: null, vin: DEMO_CLAIM.vin, archived: false,
      owners: 2, ownerSince: new Date().toISOString(), shareToken: null, transferExpires: null,
    },
    entries: [
      entry(id, {
        kind: "install", category: "exhaust", title: "Cat-back exhaust", partBrand: "Northline", compliance: "carb_eo",
        carbEo: "D-9002-3", performedOn: "2023-07-09", odometer: 52000, createdAt: "2023-07-09T20:00:00Z",
        installerType: "shop", installerName: "Pinecrest Auto", receipts: [receipt("r8", "2023-07-09T20:01:00Z")],
        confirmation: { ...confirm("Pinecrest Auto", "2023-07-11T15:00:00Z"), shopCity: "Golden, CO" },
      }),
    ],
  };
}
