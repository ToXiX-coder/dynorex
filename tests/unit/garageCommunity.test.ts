import { describe, expect, it } from "vitest";
import { earnedBadges } from "@/domain/achievements";
import { eventIcs, icsFileName } from "@/domain/calendar";
import {
  compareTires,
  dragEstimate,
  fuelCost,
  parseTire,
  rpmAtSpeed,
  speedAtRpm,
  tireDims,
  wheelFitment,
} from "@/domain/calculators";
import { dueStatus, dueText, suggestNextDue } from "@/domain/maintenance";
import { staticPinsMapUrl } from "@/domain/maps";
import { parseRetrieve } from "@/domain/places";

const TOKEN = "pk.sample-token.abc";
const today = new Date(2026, 9, 10);

describe("maintenance reminders", () => {
  it("due by date or mileage, whichever comes first", () => {
    expect(dueStatus({ next_due_on: "2026-12-01", next_due_odometer: null }, null, today)).toMatchObject({
      state: "ok",
      days: 52,
    });
    expect(dueStatus({ next_due_on: "2026-10-30", next_due_odometer: null }, null, today).state).toBe("soon");
    expect(dueStatus({ next_due_on: "2026-12-01", next_due_odometer: 63000 }, 62700, today)).toMatchObject({
      state: "soon",
      miles: 300,
    });
    expect(dueStatus({ next_due_on: "2026-10-01", next_due_odometer: null }, null, today).state).toBe("overdue");
    expect(dueStatus({ next_due_on: null, next_due_odometer: null }, 1000, today).state).toBe("none");
  });
  it("says it plainly", () => {
    expect(dueText(dueStatus({ next_due_on: "2026-10-01", next_due_odometer: null }, null, today))).toBe(
      "Overdue by 9 days",
    );
    expect(dueText(dueStatus({ next_due_on: "2026-10-22", next_due_odometer: 64000 }, 62200, today))).toBe(
      "Due in 1,800 mi or 12 days",
    );
  });
  it("suggests typical intervals for common jobs only", () => {
    expect(suggestNextDue("Oil change", "2026-04-15", 58000)).toEqual({
      next_due_on: "2026-10-15",
      next_due_odometer: 63000,
    });
    expect(suggestNextDue("Custom wrap", "2026-04-15", 58000)).toEqual({ next_due_on: null, next_due_odometer: null });
  });
});

describe("calculators", () => {
  it("tire sizes and speedometer error", () => {
    expect(parseTire("245/40ZR18")).toEqual({ width: 245, aspect: 40, rim: 18 });
    expect(parseTire("nonsense")).toBeNull();
    expect(tireDims({ width: 245, aspect: 40, rim: 18 }).diameterIn).toBe(25.72);
    const c = compareTires({ width: 245, aspect: 40, rim: 18 }, { width: 255, aspect: 35, rim: 19 });
    expect(c.diameterChangePct).toBeCloseTo(1.17, 1);
    expect(c.realAtIndicated60).toBe(60.7);
  });
  it("wheel offset poke and inner clearance", () => {
    expect(wheelFitment({ width: 8, offset: 45 }, { width: 9, offset: 35 })).toEqual({ pokeMm: 22.7, innerMm: 2.7 });
  });
  it("gearing round-trips", () => {
    const rpm = rpmAtSpeed(60, 1, 4.11, 25.72);
    expect(rpm).toBe(3223);
    expect(speedAtRpm(rpm, 1, 4.11, 25.72)).toBeCloseTo(60, 0);
  });
  it("drag and fuel estimates", () => {
    const d = dragEstimate(3300, 250);
    expect(d.lbPerHp).toBe(13.2);
    expect(d.quarterEt).toBeGreaterThan(13);
    expect(d.quarterEt).toBeLessThan(14.5);
    expect(d.zeroToSixty).toBeGreaterThan(4);
    expect(fuelCost(250, 25, 4)).toEqual({ gallons: 10, cost: 40 });
  });
});

describe("events map, calendar, places", () => {
  it("pins go to Mapbox only with a public token; one pin zooms in", () => {
    expect(staticPinsMapUrl([{ lat: 34.05, lng: -118.25 }], null)).toBeNull();
    expect(staticPinsMapUrl([{ lat: 34.05, lng: -118.25 }], "sk.secret.x")).toBeNull();
    const one = staticPinsMapUrl([{ lat: 34.05, lng: -118.25 }], TOKEN)!;
    expect(one).toContain("pin-l-1+aaff00(-118.25000,34.05000)");
    expect(one).toContain("/-118.25000,34.05000,14/");
    const many = staticPinsMapUrl(
      Array.from({ length: 12 }, (_, i) => ({ lat: 34 + i * 0.01, lng: -118 })),
      TOKEN,
    )!;
    expect(many).toContain("pin-l-9+");
    expect(many).not.toContain("pin-l-10+");
    expect(many).toContain("/auto/");
  });
  it("calendar files are valid and escaped", () => {
    const ics = eventIcs(
      {
        event_id: "e1",
        title: "Cars, Coffee; Sunday",
        description: "Line 1\nLine 2",
        starts_at: "2026-10-12T16:00:00Z",
        ends_at: "2026-10-12T18:00:00Z",
        location_text: "Sample lot",
        place_lat: 34.05,
        place_lng: -118.25,
        url: "https://dynorex.app/events/e1",
      },
      new Date("2026-10-10T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART:20261012T160000Z");
    expect(ics).toContain("SUMMARY:Cars\\, Coffee\\; Sunday");
    expect(ics).toContain("GEO:34.05000;-118.25000");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(icsFileName("Cars & Coffee!!")).toBe("cars-coffee.ics");
  });
  it("only well-formed coordinates come back from place lookups", () => {
    expect(parseRetrieve({ features: [{ geometry: { coordinates: [-118.2437, 34.0522] } }] })).toEqual({
      lat: 34.0522,
      lng: -118.2437,
    });
    expect(parseRetrieve({ features: [{ geometry: { coordinates: [500, 34] } }] })).toBeNull();
    expect(parseRetrieve({})).toBeNull();
  });
});

describe("badges", () => {
  it("keeps known badges in display order and ignores unknown ids", () => {
    expect(earnedBadges(["club_founder", "first_build", "something_new"]).map((b) => b.id)).toEqual([
      "first_build",
      "club_founder",
    ]);
  });
});
