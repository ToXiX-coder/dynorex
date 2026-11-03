import type { BuildGoalId } from "./onboarding";

/**
 * Your "driver": the little car person on your profile button and profile. Three slots, each from a fixed
 * list. Stored as one string "head:outfit:prop" (users.driver_gear, checked by the database); null means
 * "dress me for my build goal". Purely cosmetic: no item is paid, earned or ranked.
 */
export const HEADGEAR = [
  { id: "race_helmet", label: "Race helmet" },
  { id: "cap", label: "Backwards cap" },
  { id: "beanie", label: "Beanie" },
  { id: "headband", label: "Headband" },
  { id: "flat_cap", label: "Flat cap" },
  { id: "headset", label: "Pit headset" },
  { id: "shades", label: "Shades" },
  { id: "none", label: "Just hair" },
] as const;

export const OUTFITS = [
  { id: "race_suit", label: "Race suit" },
  { id: "mechanic_jacket", label: "Mechanic's jacket" },
  { id: "hoodie", label: "Hoodie" },
  { id: "flannel", label: "Flannel" },
  { id: "tee", label: "Tee" },
] as const;

export const PROPS = [
  { id: "wrench", label: "Wrench" },
  { id: "flag", label: "Checkered flag" },
  { id: "trophy", label: "Trophy" },
  { id: "keys", label: "Keys" },
  { id: "none", label: "Nothing" },
] as const;

export type HeadId = (typeof HEADGEAR)[number]["id"];
export type OutfitId = (typeof OUTFITS)[number]["id"];
export type PropId = (typeof PROPS)[number]["id"];
export type Gear = { head: HeadId; outfit: OutfitId; prop: PropId };

/** What each build goal wears by default (also what's marked "suggested" in the picker). */
export const GOAL_GEAR: Record<BuildGoalId, Gear> = {
  daily_driver: { head: "cap", outfit: "hoodie", prop: "keys" },
  track_build: { head: "race_helmet", outfit: "race_suit", prop: "flag" },
  show_car: { head: "shades", outfit: "tee", prop: "trophy" },
  off_road: { head: "beanie", outfit: "flannel", prop: "wrench" },
  jdm_build: { head: "headband", outfit: "hoodie", prop: "keys" },
  restomod: { head: "flat_cap", outfit: "mechanic_jacket", prop: "wrench" },
  stance_build: { head: "shades", outfit: "hoodie", prop: "keys" },
  just_browsing: { head: "none", outfit: "tee", prop: "none" },
};
const NO_GOAL: Gear = { head: "none", outfit: "tee", prop: "none" };

const has = <T extends { id: string }>(list: readonly T[], id: string): id is T["id"] => list.some((x) => x.id === id);

/** Parse the stored string; anything unknown or malformed falls back to the goal's look. */
export function parseGear(stored: string | null | undefined, goal: string | null | undefined): Gear {
  const base = goalGear(goal);
  if (!stored) return base;
  const [h = "", o = "", p = ""] = stored.split(":");
  if (stored.split(":").length !== 3 || !has(HEADGEAR, h) || !has(OUTFITS, o) || !has(PROPS, p)) return base;
  return { head: h, outfit: o, prop: p };
}

export function goalGear(goal: string | null | undefined): Gear {
  return goal && goal in GOAL_GEAR ? GOAL_GEAR[goal as BuildGoalId] : NO_GOAL;
}

/** null when it matches the goal's look, so changing your goal later still re-dresses you. */
export function serializeGear(g: Gear, goal: string | null | undefined): string | null {
  const d = goalGear(goal);
  if (g.head === d.head && g.outfit === d.outfit && g.prop === d.prop) return null;
  return `${g.head}:${g.outfit}:${g.prop}`;
}

/** The database check uses the same lists (see the driver_gear migration); this keeps them in sync in tests. */
export const GEAR_PATTERN = `^(${HEADGEAR.map((x) => x.id).join("|")}):(${OUTFITS.map((x) => x.id).join("|")}):(${PROPS.map((x) => x.id).join("|")})$`;

export function gearDescription(g: Gear): string {
  const name = (list: readonly { id: string; label: string }[], id: string) =>
    list.find((x) => x.id === id)!.label.toLowerCase();
  const parts = [
    g.head === "none" ? null : name(HEADGEAR, g.head),
    name(OUTFITS, g.outfit),
    g.prop === "none" ? null : `holding ${g.prop === "keys" ? "the keys" : `a ${name(PROPS, g.prop)}`}`,
  ].filter(Boolean);
  return `Driver in ${parts.join(", ")}`;
}

/** Easter egg: tap your driver and it says something in character. Full kits get their own line. */
export function driverQuip(g: Gear, tap: number): string {
  if (g.head === "race_helmet" && g.outfit === "race_suit" && g.prop === "flag") {
    return ["Full send. Pole position is yours.", "Lights out and away we go!", "Box, box. Just kidding."][tap % 3]!;
  }
  if (g.outfit === "mechanic_jacket" && g.prop === "wrench") {
    return ["10 mm socket? Never seen it.", "Righty tighty. Torque spec matters.", "One more mod. Then sleep."][
      tap % 3
    ]!;
  }
  const lines: Record<string, string[]> = {
    race_helmet: ["Visor down. Let's go.", "Apexes don't hit themselves."],
    cap: ["Daily driven, weekend loved.", "Cap backwards means business."],
    beanie: ["Air down, send it.", "Mud is just extra paint."],
    headband: ["Touge tonight?", "Ganbatte!"],
    flat_cap: ["They don't make 'em like this. So I did.", "Classic lines, modern bite."],
    headset: ["Radio check. You're clear.", "Pit wall says: push."],
    shades: ["Too fresh for the sun.", "Fitment check: perfect."],
    none: ["Just here for the builds.", "Vroom."],
  };
  const set = lines[g.head]!;
  return set[tap % set.length]!;
}
