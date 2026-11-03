import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  driverQuip,
  GEAR_PATTERN,
  gearDescription,
  GOAL_GEAR,
  goalGear,
  HEADGEAR,
  OUTFITS,
  parseGear,
  PROPS,
  serializeGear,
} from "@/domain/gear";
import { BUILD_GOALS } from "@/domain/onboarding";

describe("driver gear", () => {
  it("every build goal has a kit, and it's made of real items", () => {
    for (const g of BUILD_GOALS) {
      const kit = GOAL_GEAR[g.id];
      expect(
        HEADGEAR.some((x) => x.id === kit.head),
        g.id,
      ).toBe(true);
      expect(
        OUTFITS.some((x) => x.id === kit.outfit),
        g.id,
      ).toBe(true);
      expect(
        PROPS.some((x) => x.id === kit.prop),
        g.id,
      ).toBe(true);
    }
    expect(goalGear("track_build")).toEqual({ head: "race_helmet", outfit: "race_suit", prop: "flag" });
    expect(goalGear("restomod").outfit).toBe("mechanic_jacket");
  });

  it("the database check accepts exactly the app's items", () => {
    const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261015000000_driver_gear.sql"), "utf8");
    expect(sql).toContain(`driver_gear ~ '${GEAR_PATTERN}'`);
  });

  it("stored as null while it matches the goal, so changing goal re-dresses you", () => {
    expect(serializeGear(goalGear("off_road"), "off_road")).toBeNull();
    const custom = { ...goalGear("off_road"), head: "race_helmet" as const };
    expect(serializeGear(custom, "off_road")).toBe("race_helmet:flannel:wrench");
    expect(parseGear("race_helmet:flannel:wrench", "daily_driver")).toEqual(custom);
    expect(parseGear(null, "jdm_build")).toEqual(goalGear("jdm_build"));
  });

  it("anything unknown falls back to the goal's look instead of breaking", () => {
    expect(parseGear("tiara:tee:none", "show_car")).toEqual(goalGear("show_car"));
    expect(parseGear("cap:hoodie", null)).toEqual({ head: "none", outfit: "tee", prop: "none" });
    expect(new RegExp(GEAR_PATTERN).test("cap:hoodie:keys")).toBe(true);
    expect(new RegExp(GEAR_PATTERN).test("cap:hoodie:keys:extra")).toBe(false);
  });

  it("screen readers hear what the driver is wearing", () => {
    expect(gearDescription(goalGear("track_build"))).toBe("Driver in race helmet, race suit, holding a checkered flag");
    expect(gearDescription(goalGear("daily_driver"))).toBe("Driver in backwards cap, hoodie, holding the keys");
    expect(gearDescription(goalGear("just_browsing"))).toBe("Driver in tee");
  });

  it("easter egg: tapping cycles lines in character, full kits get their own", () => {
    const track = goalGear("track_build");
    expect(driverQuip(track, 0)).toMatch(/Full send/);
    expect(driverQuip(track, 1)).not.toBe(driverQuip(track, 0));
    expect(driverQuip(goalGear("restomod"), 0)).toMatch(/10 mm/);
    for (const h of HEADGEAR)
      expect(driverQuip({ head: h.id, outfit: "tee", prop: "none" }, 5).length).toBeGreaterThan(3);
  });
});
