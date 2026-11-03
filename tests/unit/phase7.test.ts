import { beforeEach, describe, expect, it } from "vitest";
import { demoEventService, demoLineService } from "@/demo/v2";
import { resetDemo, demoActivatePlus } from "@/demo/services";
import { notificationHref, isPublicPath } from "@/domain/deepLinks";
import { checkinOpen, eventWindow, spotsLeft } from "@/domain/events";
import {
  acceptFix,
  formatDistance,
  haversineM,
  simulatedDrive,
  trackDistanceM,
  trackToSvgPath,
  trimForSharing,
  type TrackPoint,
} from "@/domain/routes";

const E = "e0000000-0000-4000-8000-000000000001";

describe("route helpers", () => {
  it("measures distance like the server (great circle)", () => {
    expect(haversineM([40, -74], [40.001, -74])).toBeCloseTo(111.2, 0);
    expect(formatDistance(1609.344)).toBe("1.0 mi");
  });

  it("keeps good fixes and drops inaccurate, jittery, backwards or impossible ones", () => {
    const a: TrackPoint = [40, -74, 0];
    expect(acceptFix(undefined, a, 10)).toBe(true);
    expect(acceptFix(a, [40.001, -74, 10_000], 80)).toBe(false); // inaccurate
    expect(acceptFix(a, [40.00001, -74, 10_000], 5)).toBe(false); // ~1 m: standing still
    expect(acceptFix(a, [40.001, -74, 0], 5)).toBe(false); // same time
    expect(acceptFix(a, [40.1, -74, 1000], 5)).toBe(false); // 11 km in 1 s
    expect(acceptFix(a, [40.001, -74, 10_000], 5)).toBe(true);
  });

  it("trimming hides the first and last 500 m and drops timestamps; short drives can't be shared", () => {
    const pts: TrackPoint[] = Array.from({ length: 46 }, (_, i) => [40 + i * 0.001, -74, i * 10_000]); // ~5 km
    const t = trimForSharing(pts)!;
    expect(t[0]).toHaveLength(2);
    expect(haversineM([pts[0]![0], pts[0]![1]], t[0]!)).toBeGreaterThanOrEqual(500);
    expect(haversineM([pts[45]![0], pts[45]![1]], t[t.length - 1]!)).toBeGreaterThanOrEqual(500);
    expect(trimForSharing(pts.slice(0, 8))).toBeNull(); // ~0.8 km
  });

  it("the pitch-mode simulated drive is a valid track and draws as a path", () => {
    const d = simulatedDrive();
    for (let i = 1; i < d.length; i++) expect(acceptFix(d[i - 1], d[i]!, 5)).toBe(true);
    expect(trackDistanceM(d.map(([a, b]) => [a, b]))).toBeGreaterThan(10_000);
    expect(
      trackToSvgPath(
        d.map(([a, b]) => [a, b]),
        320,
        180,
      ),
    ).toMatch(/^M[\d.]+ [\d.]+ L/);
  });
});

describe("event helpers and links", () => {
  it("builds the event window and knows when check-in is open", () => {
    const from = new Date("2026-10-05T10:00:00");
    const w = eventWindow(1, "09:00", 2, from);
    expect(new Date(w.starts_at).getHours()).toBe(9);
    expect((Date.parse(w.ends_at) - Date.parse(w.starts_at)) / 3_600_000).toBe(2);
    expect(eventWindow(0, "07:00", 1, from).inPast).toBe(true);
    const e = { starts_at: "2026-10-05T12:00:00Z", ends_at: "2026-10-05T14:00:00Z", status: "scheduled" };
    expect(checkinOpen(e, Date.parse("2026-10-05T11:30:00Z"))).toBe(true);
    expect(checkinOpen(e, Date.parse("2026-10-05T10:30:00Z"))).toBe(false);
    expect(checkinOpen({ ...e, status: "cancelled" }, Date.parse("2026-10-05T12:30:00Z"))).toBe(false);
    expect(spotsLeft({ capacity: 2, going_count: 2 })).toBe(0);
    expect(spotsLeft({ capacity: null, going_count: 9 })).toBeNull();
  });

  it("route and event links are public and notification taps reach events", () => {
    expect(isPublicPath(`/route/${E}`)).toBe(true);
    expect(isPublicPath(`/events/${E}`)).toBe(true);
    expect(notificationHref({ entity_type: "event", entity_id: E })).toBe(`/events/${E}`);
  });
});

describe("pitch-mode Line and Paddock follow the server rules", () => {
  beforeEach(() => resetDemo());

  it("5 drives a month on Free, unlimited on Dynorex+, shared drives are trimmed", async () => {
    const drive = simulatedDrive(10);
    for (let i = 0; i < 4; i++) expect((await demoLineService.save(`ref-${i}`, "d", null, drive, false)).ok).toBe(true);
    expect(await demoLineService.save("ref-x", "d", null, drive, false)).toEqual({
      ok: false,
      error: { key: "planLimitRoutes" },
    });
    demoActivatePlus("monthly", "app_store");
    const r = await demoLineService.save("ref-y", "shared", null, drive, true);
    const pub = r.ok ? await demoLineService.publicRoute(r.data) : null;
    expect(pub?.ok && pub.data?.points[0]).toHaveLength(2);
  });

  it("events: capacity, RSVP before check-in, and one code per event", async () => {
    const up = await demoEventService.upcoming(0);
    const full = up.ok ? up.data.find((e) => e.capacity === 2)! : null; // "Track walk": 2 of 2 going
    expect(await demoEventService.rsvp(full!.event_id, "going")).toEqual({ ok: false, error: { key: "eventFull" } });
    const mine = up.ok ? up.data.find((e) => e.organizer_username === "demo_driver")! : null;
    const code = await demoEventService.checkinCode(mine!.event_id);
    expect(code.ok && code.data.code).toMatch(/^\d{6}$/);
    const again = await demoEventService.checkinCode(mine!.event_id);
    expect(again.ok && again.data.code).toBe(code.ok && code.data.code);
  });
});
