/**
 * D-71: what kind of vehicle a build is. Cars came first and stay the default: a row saved before this existed (or
 * an offline copy cached before it) has no kind and reads as a car, so nothing already stored changes.
 * Motorcycles share the car's numbers (power, torque, weight, 0-60). The third kind is stored as "ebike" and, since
 * D-73, means an e-moto: a light electric motorcycle (Sur-Ron, Talaria, E Ride Pro, Stark). It has its own numbers
 * (peak power, pack voltage and capacity, range, top speed, road use) and no NHTSA lookups, recalls or 0-60.
 */
import type { ModCategoryId } from "./validation/build";

export const VEHICLE_KINDS = [
  { id: "car", label: "Car" },
  { id: "motorcycle", label: "Motorcycle" },
  { id: "ebike", label: "E-moto" },
] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number]["id"];

export const kindOf = (v: { kind?: string | null } | null | undefined): VehicleKind =>
  v?.kind === "motorcycle" || v?.kind === "ebike" ? v.kind : "car";

export const kindLabel = (k: VehicleKind) => VEHICLE_KINDS.find((x) => x.id === k)!.label;

/** Plural for filters ("Show only E-motos"). */
export const kindPlural = (k: VehicleKind) => (k === "car" ? "Cars" : k === "motorcycle" ? "Motorcycles" : "E-motos");

/** What the vehicle is called in running text ("Add your first mod to this e-moto"). */
export const kindNoun = (k: VehicleKind) => (k === "car" ? "car" : k === "motorcycle" ? "bike" : "e-moto");

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
  // D-73: what e-moto owners actually change: controller and motor, the pack, gearing, suspension, plastics
  ebike: [
    "motor",
    "battery",
    "drivetrain",
    "suspension",
    "wheels",
    "brakes",
    "controls",
    "electronics",
    "exterior",
    "safety",
  ],
};

/**
 * A category from the shared keyword rules, moved to the closest one this kind has: an e-moto "motor" mod is Motor
 * not Engine, a motorcycle "brake pads" mod is Brakes not Safety. Null when the kind has nothing close.
 */
const CLOSEST: Partial<Record<VehicleKind, Partial<Record<ModCategoryId, ModCategoryId>>>> = {
  motorcycle: { aero: "exterior", interior: "controls" },
  ebike: { engine: "motor", aero: "exterior", interior: "controls", cockpit: "controls", luggage: "exterior" },
};
export function categoryForKind(c: ModCategoryId | null, kind: VehicleKind): ModCategoryId | null {
  if (!c) return null;
  if (KIND_CATEGORIES[kind].includes(c)) return c;
  const moved = CLOSEST[kind]?.[c];
  return moved && KIND_CATEGORIES[kind].includes(moved) ? moved : null;
}

/** Which spec fields a mod can change on this kind (an e-moto's power is its own kW figure, so weight carries over). */
export const kindSpecFields = (k: VehicleKind) =>
  k === "ebike" ? (["weight"] as const) : (["hp", "torque", "weight", "zero_to_sixty"] as const);

/** D-73: peak power as people quote it: "8 kW", "12.5 kW". */
export const kwText = (watts: number | string | null | undefined) =>
  watts ? `${(Number(watts) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kW` : null;

/** The short fact after the name: "689cc" for a motorcycle, "8 kW · 60V" for an e-moto. */
export function kindDetail(v: {
  kind?: string | null;
  engine_cc?: number | null;
  motor_w?: number | string | null;
  battery_v?: number | null;
}): string | null {
  const k = kindOf(v);
  if (k === "motorcycle" && v.engine_cc) return `${Number(v.engine_cc).toLocaleString()}cc`;
  if (k === "ebike") return [kwText(v.motor_w), v.battery_v ? `${v.battery_v}V` : null].filter(Boolean).join(" · ") || null;
  return null;
}

/** "Street legal" / "Off-road only", or null when the owner hasn't said. */
export const roadUseText = (streetLegal: boolean | null | undefined) =>
  streetLegal === true ? "Street legal" : streetLegal === false ? "Off-road only" : null;

/** VIN, NHTSA lookups, recalls and 0-60 timing: cars and motorcycles (NHTSA covers both), never e-motos. */
export const hasVin = (k: VehicleKind) => k !== "ebike";
export const usesNhtsa = (k: VehicleKind) => k !== "ebike";
export const timesZeroToSixty = (k: VehicleKind) => k !== "ebike";
