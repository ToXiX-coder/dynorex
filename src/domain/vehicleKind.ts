/**
 * D-71: what kind of vehicle a build is. Cars came first and stay the default: a row saved before this existed (or
 * an offline copy cached before it) has no kind and reads as a car, so nothing already stored changes.
 * Motorcycles share the car's numbers (power, torque, weight, 0-60); e-bikes have their own (motor watts, battery,
 * range, top speed) and no VIN, 0-60, NHTSA lookups or recalls.
 */
import type { ModCategoryId } from "./validation/build";

export const VEHICLE_KINDS = [
  { id: "car", label: "Car" },
  { id: "motorcycle", label: "Motorcycle" },
  { id: "ebike", label: "E-bike" },
] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number]["id"];

export const kindOf = (v: { kind?: string | null } | null | undefined): VehicleKind =>
  v?.kind === "motorcycle" || v?.kind === "ebike" ? v.kind : "car";

export const kindLabel = (k: VehicleKind) => VEHICLE_KINDS.find((x) => x.id === k)!.label;

/** What the vehicle is called in running text ("Add your first mod to this e-bike"). */
export const kindNoun = (k: VehicleKind) => (k === "car" ? "car" : k === "motorcycle" ? "bike" : "e-bike");

/** The mod categories each kind offers, in grid order. Cars keep exactly the nine they always had. */
export const KIND_CATEGORIES: Record<VehicleKind, readonly ModCategoryId[]> = {
  car: ["engine", "suspension", "exhaust", "aero", "interior", "wheels", "exterior", "electronics", "safety"],
  motorcycle: [
    "engine",
    "exhaust",
    "suspension",
    "brakes",
    "wheels",
    "controls",
    "electronics",
    "exterior",
    "luggage",
    "safety",
  ],
  ebike: ["motor", "battery", "drivetrain", "brakes", "wheels", "suspension", "cockpit", "electronics", "safety"],
};

/**
 * A category from the shared keyword rules, moved to the closest one this kind has: an e-bike "motor" mod is Motor
 * not Engine, a motorcycle "brake pads" mod is Brakes not Safety. Null when the kind has nothing close.
 */
const CLOSEST: Partial<Record<VehicleKind, Partial<Record<ModCategoryId, ModCategoryId>>>> = {
  motorcycle: { aero: "exterior", interior: "controls" },
  ebike: { engine: "motor", exhaust: "motor", aero: "cockpit", interior: "cockpit", exterior: "cockpit", controls: "cockpit" },
};
export function categoryForKind(c: ModCategoryId | null, kind: VehicleKind): ModCategoryId | null {
  if (!c) return null;
  if (KIND_CATEGORIES[kind].includes(c)) return c;
  const moved = CLOSEST[kind]?.[c];
  return moved && KIND_CATEGORIES[kind].includes(moved) ? moved : null;
}

/** Which spec fields a mod can change on this kind (an e-bike's power is in watts, so only weight carries over). */
export const kindSpecFields = (k: VehicleKind) =>
  k === "ebike" ? (["weight"] as const) : (["hp", "torque", "weight", "zero_to_sixty"] as const);

/** VIN, NHTSA lookups, recalls and 0-60 timing: cars and motorcycles (NHTSA covers both), never e-bikes. */
export const hasVin = (k: VehicleKind) => k !== "ebike";
export const usesNhtsa = (k: VehicleKind) => k !== "ebike";
export const timesZeroToSixty = (k: VehicleKind) => k !== "ebike";
