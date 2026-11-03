import type { RecordView } from "./services";
import { SOURCE_LABELS } from "./labels";
import type { Vehicle, VehicleRecord } from "./types";

/**
 * SAMPLE DATA ONLY. Invented vehicles, invented shops, no real people, VINs, plates or places.
 * Held in code. The demo never touches the database.
 */
export const DEMO_VEHICLES: Vehicle[] = [
  {
    id: "demo-roadster",
    ownerId: "demo-owner",
    year: 1999,
    make: "Sample Motors",
    model: "Roadster Demo",
    nickname: "Sample Roadster",
    mileage: 84200,
    mileageUnit: "mi",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "demo-hatch",
    ownerId: "demo-owner",
    year: 2012,
    make: "Example Auto",
    model: "Hatch Sample",
    mileage: 120500,
    mileageUnit: "km",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

const rec = (
  r: Partial<VehicleRecord> &
    Pick<VehicleRecord, "id" | "vehicleId" | "type" | "title" | "category" | "date" | "source">,
): VehicleRecord => ({
  ownerId: "demo-owner",
  approval: "approved",
  identityCheckedAt: null,
  createdAt: `${r.date}T12:00:00Z`,
  updatedAt: `${r.date}T12:00:00Z`,
  ...r,
});

const DEMO_RECORDS: VehicleRecord[] = [
  rec({
    id: "d1",
    vehicleId: "demo-roadster",
    type: "modification",
    title: "Front sway bar",
    category: "Suspension",
    partName: "Front sway bar",
    brand: "Sample Parts Co.",
    partNumber: "SAMPLE-0001",
    status: "installed",
    date: "2026-03-14",
    mileage: 83100,
    costCents: 18950,
    currency: "USD",
    notes: "Installed in the driveway. Torqued to the spec in the instructions.",
    source: "owner_entered",
  }),
  rec({
    id: "d2",
    vehicleId: "demo-roadster",
    type: "service",
    title: "Oil and filter change",
    category: "Engine",
    status: "completed",
    date: "2026-02-02",
    mileage: 82400,
    costCents: 6400,
    currency: "USD",
    notes: "Receipt photo attached.",
    source: "owner_entered",
  }),
  rec({
    id: "d3",
    vehicleId: "demo-roadster",
    type: "modification",
    title: "Wheel set",
    category: "Wheels and tires",
    partName: "17-inch wheels",
    brand: "Example Wheels",
    status: "ordered",
    date: "2026-04-20",
    source: "owner_entered",
    notes: "Waiting on delivery.",
  }),
  rec({
    id: "d4",
    vehicleId: "demo-roadster",
    type: "setup",
    title: "Dyno sheet, baseline run",
    category: "Measurement",
    date: "2026-03-30",
    source: "measurement_attached",
    notes: "A sample measurement file is attached. Dynorex has not checked the numbers.",
  }),
  rec({
    id: "d5",
    vehicleId: "demo-roadster",
    type: "modification",
    title: "Coilover install",
    category: "Suspension",
    partName: "Coilover kit",
    brand: "Sample Parts Co.",
    status: "installed",
    date: "2026-05-09",
    source: "shared_link",
    submitterLabel: "Sample Shop A (fictional)",
    notes: "Sent through a shared link and approved by the owner.",
  }),
  rec({
    id: "d6",
    vehicleId: "demo-roadster",
    type: "setup",
    title: "Alignment settings",
    category: "Alignment",
    date: "2026-05-10",
    source: "owner_entered",
    notes: "Front toe slightly out. Tire pressures 32 psi cold.",
  }),
  rec({
    id: "d7",
    vehicleId: "demo-hatch",
    type: "service",
    title: "Brake pads and fluid",
    category: "Brakes",
    status: "completed",
    date: "2026-02-18",
    mileage: 119800,
    costCents: 21000,
    currency: "CAD",
    source: "owner_entered",
  }),
  rec({
    id: "d8",
    vehicleId: "demo-hatch",
    type: "modification",
    title: "Cold air intake",
    category: "Intake",
    brand: "Example Auto Parts",
    status: "removed",
    date: "2026-01-15",
    notes: "Removed. Went back to stock.",
    source: "owner_entered",
  }),
];

const ATTACHMENTS: Record<string, RecordView["attachments"]> = {
  d2: [
    { id: "a-d2", displayName: "oil-change-receipt-sample.png", mime: "image/png", size: 120_000 },
  ],
  d4: [
    { id: "a-d4", displayName: "dyno-sheet-sample.pdf", mime: "application/pdf", size: 340_000 },
  ],
};

export const demoVehicle = (id: string) => DEMO_VEHICLES.find((v) => v.id === id);
export const demoRecords = (vehicleId: string): VehicleRecord[] =>
  DEMO_RECORDS.filter((r) => r.vehicleId === vehicleId);
export const demoRecordViews = (vehicleId: string): RecordView[] =>
  demoRecords(vehicleId).map((r) => ({
    ...r,
    attachments: ATTACHMENTS[r.id] ?? [],
    sourceLabel: SOURCE_LABELS[r.source].long,
  }));
