import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

/** Phase 7 first slice: Line (routes) and Paddock (events). */
const A = "00000000-0000-4000-8000-0000000000a7";
const B = "00000000-0000-4000-8000-0000000000b7";
const C = "00000000-0000-4000-8000-0000000000c7";
let db: PGlite;

const q = <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) =>
  as(db, uid, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
async function fails(uid: string | null, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await q(uid, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`Expected failure: ${sql}`);
}

/** A straight drive north from a "home" point: ~111 m per 0.001 degree, one fix every 10 s. */
function track(km: number, lat0 = 40, lon0 = -74, t0 = Date.parse("2026-10-01T08:00:00Z")) {
  const steps = Math.round(km * 9); // ~111 m steps
  return Array.from({ length: steps + 1 }, (_, i) => [lat0 + i * 0.001, lon0, t0 + i * 10_000]);
}
let ref = 0;
const newRef = () => `00000000-0000-4000-8000-${(++ref).toString(16).padStart(12, "0")}`;
const save = (uid: string, points: unknown, pub = false, cref = newRef()) =>
  q<{ id: string }>(uid, "select public.save_route($1, 'Morning drive', null, $2::jsonb, $3) as id", [
    cref,
    JSON.stringify(points),
    pub,
  ]).then((r) => r[0]!.id);

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "driver_a7"],
    [B, "driver_b7"],
    [C, "driver_c7"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("Line: routes", () => {
  it("distance and duration are computed by the server; bad tracks are refused", async () => {
    const id = await save(A, track(5));
    const [r] = await q<{ distance_m: number; duration_s: number }>(
      A,
      "select distance_m, duration_s from public.routes where id = $1",
      [id],
    );
    expect(r!.distance_m).toBeGreaterThan(4900);
    expect(r!.distance_m).toBeLessThan(5100);
    expect(r!.duration_s).toBe(450);
    // teleporting (impossible speed), time going backwards, malformed
    const teleport = [
      [40, -74, 0],
      [41, -74, 1000],
    ];
    expect(
      await fails(A, "select public.save_route($1, 't', null, $2::jsonb, false)", [newRef(), JSON.stringify(teleport)]),
    ).toMatch(/invalid_route/);
    const backwards = [
      [40, -74, 5000],
      [40.001, -74, 1000],
    ];
    expect(
      await fails(A, "select public.save_route($1, 't', null, $2::jsonb, false)", [
        newRef(),
        JSON.stringify(backwards),
      ]),
    ).toMatch(/invalid_route/);
    expect(
      await fails(A, "select public.save_route($1, 't', null, $2::jsonb, false)", [newRef(), '{"lat":1}']),
    ).toMatch(/invalid_route/);
    // the same client_ref doesn't create a second route
    const cref = newRef();
    expect(await save(A, track(2), false, cref)).toBe(await save(A, track(2), false, cref));
  });

  it("clients can't write routes directly or read anyone else's full track", async () => {
    expect(
      await fails(
        A,
        "insert into public.routes (title, points, distance_m, duration_s, started_at, ended_at) values ('x', '[[0,0,0],[0,0,1]]', 0, 0, now(), now())",
      ),
    ).toMatch(/permission denied/);
    const id = await save(A, track(5), true);
    expect(await q(B, "select * from public.routes where id = $1", [id])).toEqual([]);
    expect(await fails(A, "update public.routes set distance_m = 1 where id = $1", [id])).toMatch(/permission denied/);
  });

  it("shared routes hide the first and last 500 m and the start time; short routes can't be shared", async () => {
    const pts = track(5);
    const id = await save(A, pts, true);
    const [pub] = await q<{ points: number[][]; drive_date: string }>(
      null,
      "select points, drive_date from public.public_routes where route_id = $1",
      [id],
    );
    const first = pub!.points[0]!;
    const last = pub!.points[pub!.points.length - 1]!;
    // home (start) and destination (end) are at least ~500 m from what's shown
    expect((first[0]! - pts[0]![0]!) * 111_000).toBeGreaterThanOrEqual(495);
    expect((pts[pts.length - 1]![0]! - last[0]!) * 111_000).toBeGreaterThanOrEqual(495);
    expect(first).toHaveLength(2); // no timestamps
    expect(JSON.stringify(await q(null, "select * from public.public_routes"))).not.toMatch(
      /owner_id|"points":\[\[40,-74/,
    );
    expect(
      await fails(A, "select public.save_route($1, 'short', null, $2::jsonb, true)", [
        newRef(),
        JSON.stringify(track(0.8)),
      ]),
    ).toMatch(/route_too_short_to_share/);
    // making it private removes the public copy entirely
    await q(A, "select public.set_route_public($1, false)", [id]);
    expect(await q(null, "select 1 from public.public_routes")).toEqual([]);
    expect(await q(A, "select public_points from public.routes where id = $1", [id])).toEqual([
      { public_points: null },
    ]);
  });

  it("Free accounts record 5 routes a month (deleting doesn't reset it); Dynorex+ is unlimited", async () => {
    for (let i = 0; i < 5; i++) {
      const id = await save(A, track(1));
      if (i === 0) await q(A, "select public.soft_delete_route($1)", [id]);
    }
    expect(
      await fails(A, "select public.save_route($1, 'x', null, $2::jsonb, false)", [newRef(), JSON.stringify(track(1))]),
    ).toMatch(/plan_limit_routes/);
    await grantPlus(db, A);
    await save(A, track(1));
  });

  it("ratings: public routes only, not your own, once per person, blocked owners vanish", async () => {
    const id = await save(A, track(5), true);
    await q(B, "insert into public.route_ratings (route_id, stars, comment) values ($1, 5, 'Great road')", [id]);
    await q(C, "insert into public.route_ratings (route_id, stars) values ($1, 4)", [id]);
    expect(await q(null, "select rating_avg, rating_count from public.public_routes")).toEqual([
      { rating_avg: "4.5", rating_count: 2 },
    ]);
    expect(await fails(A, "insert into public.route_ratings (route_id, stars) values ($1, 5)", [id])).toMatch(
      /row-level security/,
    );
    expect(await fails(B, "insert into public.route_ratings (route_id, stars) values ($1, 1)", [id])).toMatch(
      /duplicate key/,
    );
    expect(await fails(B, "insert into public.route_ratings (route_id, stars) values ($1, 9)", [id])).toMatch(
      /check constraint/,
    );
    const priv = await save(A, track(5), false);
    expect(await fails(B, "insert into public.route_ratings (route_id, stars) values ($1, 5)", [priv])).toMatch(
      /row-level security/,
    );
    await q(B, "insert into public.blocks (blocked_id) values ($1)", [A]);
    expect(await q(B, "select * from public.public_routes")).toEqual([]);
    expect(await q(B, "select * from public.discover_routes('top', 0)")).toEqual([]);
  });

  it("the app's trim (pitch mode, previews) matches the server's trim on 25 random drives", async () => {
    const { trimForSharing } = await import("@/domain/routes");
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 25; k++) {
      let lat = 30 + rand() * 20;
      let lon = -120 + rand() * 40;
      let t = 1_700_000_000_000;
      const pts: [number, number, number][] = [];
      for (let i = 0; i < 20 + Math.floor(rand() * 120); i++) {
        lat += (rand() - 0.5) * 0.004;
        lon += (rand() - 0.5) * 0.004;
        t += 5_000 + Math.floor(rand() * 10_000);
        pts.push([lat, lon, t]);
      }
      const [{ r }] = (
        await db.query<{ r: number[][] | null }>("select public.trim_route($1::jsonb) as r", [JSON.stringify(pts)])
      ).rows as [{ r: number[][] | null }];
      const app = trimForSharing(pts);
      expect(app === null, `drive ${k}`).toBe(r === null);
      if (r && app) {
        expect(app.length, `drive ${k}`).toBe(r.length);
        app.forEach((p, i) => {
          expect(p[0]).toBeCloseTo(Number(r[i]![0]), 5);
          expect(p[1]).toBeCloseTo(Number(r[i]![1]), 5);
        });
      }
    }
  });

  it("nearby routes use the coarse start cell of the trimmed route", async () => {
    await save(A, track(5), true);
    await q(B, "select public.set_my_region(80, -148, false)"); // 40.0 N, -74 W -> cell (80, -148)
    expect(await q(B, "select title from public.discover_routes('nearby', 0)")).toEqual([{ title: "Morning drive" }]);
    await q(C, "select public.set_my_region(10, 10, false)");
    expect(await q(C, "select * from public.discover_routes('nearby', 0)")).toEqual([]);
  });
});

describe("Paddock: events", () => {
  const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const create = async (uid: string, capacity: number | null = 2, startsInH = 48) =>
    (
      await q<{ id: string }>(
        uid,
        "insert into public.events (title, starts_at, ends_at, location_text, capacity) values ('Cars and coffee', $1, $2, 'Sample City lot', $3) returning id",
        [future(startsInH), future(startsInH + 3), capacity],
      )
    )[0]!.id;

  it("needs a verified, named account; can't start in the past; organizer edits only before start", async () => {
    const U = "00000000-0000-4000-8000-0000000000d7";
    await createAuthUser(db, U, false);
    await setUsername(db, U, "unverified_d7");
    expect(
      await fails(U, "insert into public.events (title, starts_at, ends_at, location_text) values ('x', $1, $2, 'y')", [
        future(5),
        future(6),
      ]),
    ).toMatch(/row-level security/);
    expect(
      await fails(A, "insert into public.events (title, starts_at, ends_at, location_text) values ('x', $1, $2, 'y')", [
        future(-5),
        future(-4),
      ]),
    ).toMatch(/event_in_past/);
    const id = await create(A);
    // someone else's update matches no rows (RLS), so nothing changes
    expect(await q(B, "update public.events set title = 'mine now' where id = $1 returning id", [id])).toEqual([]);
    expect(await q(null, "select title from public.public_events")).toEqual([{ title: "Cars and coffee" }]);
    expect(await fails(A, "update public.events set status = 'cancelled' where id = $1", [id])).toMatch(
      /permission denied/,
    );
  });

  it("capacity is enforced; switching to interested frees the seat", async () => {
    const id = await create(A, 1);
    await q(B, "select public.rsvp_event($1, 'going')", [id]);
    expect(await fails(C, "select public.rsvp_event($1, 'going')", [id])).toMatch(/event_full/);
    await q(C, "select public.rsvp_event($1, 'interested')", [id]);
    expect(await q(null, "select going_count, interested_count from public.public_events")).toEqual([
      { going_count: 1, interested_count: 1 },
    ]);
    await q(B, "select public.rsvp_event($1, 'interested')", [id]);
    await q(C, "select public.rsvp_event($1, 'going')", [id]);
    expect(await q(B, "select status from public.event_rsvps")).toEqual([{ status: "interested" }]);
    expect(
      await fails(B, "insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'going')", [id, B]),
    ).toMatch(/permission denied/);
  });

  it("check-in: one code per event, RSVP required, once per person, guessing is rate limited", async () => {
    const id = await create(A, null, 0.5); // starts in 30 minutes: check-in window is open
    expect(await fails(B, "select * from public.event_checkin_code($1)", [id])).toMatch(/not_found/);
    const [{ code }] = (await q<{ code: string }>(A, "select code from public.event_checkin_code($1)", [id])) as [
      { code: string },
    ];
    expect(code).toMatch(/^\d{6}$/);
    expect(await fails(B, "select public.check_in_event($1, $2)", [id, code])).toMatch(/rsvp_required/);
    await q(B, "select public.rsvp_event($1, 'going')", [id]);
    const wrong = code === "123456" ? "654321" : "123456";
    expect(await fails(B, "select public.check_in_event($1, $2)", [id, wrong])).toMatch(/invalid_code/);
    await q(B, "select public.check_in_event($1, $2)", [id, code]);
    await q(B, "select public.check_in_event($1, $2)", [id, code]); // idempotent
    expect(await q(A, "select * from public.event_attendance($1)", [id])).toEqual([
      { going: 1, interested: 0, checked_in: 1 },
    ]);
    // the host sees the same code every time, and it's the only one stored
    const again = await q<{ code: string }>(A, "select code from public.event_checkin_code($1)", [id]);
    expect(again[0]!.code).toBe(code);
    expect((await db.query("select count(*)::int as n from app_private.event_checkin_codes")).rows).toEqual([{ n: 1 }]);
    // it keeps working later in the event (no rotation), for anyone who said "Going"
    await db.query("update app_private.event_checkin_codes set expires_at = now() - interval '1 second'");
    await q(C, "select public.rsvp_event($1, 'going')", [id]);
    await q(C, "select public.check_in_event($1, $2)", [id, code]);
    // once the event is over, check-in closes
    await db.query(
      "update public.events set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 minute' where id = $1",
      [id],
    );
    expect(await fails(C, "select public.check_in_event($1, $2)", [id, code])).toMatch(/checkin_closed/);
    for (let i = 0; i < 10; i++)
      await db.query("insert into app_private.rate_events (user_id, action) values ($1, 'checkin')", [C]);
    expect(await fails(C, "select public.check_in_event($1, $2)", [id, code])).toMatch(/rate_limited/);
    expect(await fails(C, "select * from app_private.event_checkin_codes")).toMatch(/permission denied/);
  });

  it("cancelling notifies attendees and closes RSVPs; reminders go out once, 24 h before", async () => {
    const soon = await create(A, null, 24);
    await q(B, "select public.rsvp_event($1, 'going')", [soon]);
    const svc = async (sql: string) =>
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        return (await tx.query(sql)).rows;
      });
    expect(await svc("select public.queue_event_reminders() as n")).toEqual([{ n: 1 }]);
    expect(await svc("select public.queue_event_reminders() as n")).toEqual([{ n: 0 }]);
    await q(A, "select public.cancel_event($1)", [soon]);
    expect(
      (await q<{ title: string }>(B, "select title from public.notifications order by created_at")).map((r) => r.title),
    ).toEqual(["Tomorrow: Cars and coffee", "Event cancelled"]);
    expect(await fails(C, "select public.rsvp_event($1, 'going')", [soon])).toMatch(/event_closed/);
    expect(await q(null, "select status from public.public_events")).toEqual([{ status: "cancelled" }]);
    expect(await q(null, "select * from public.upcoming_events(0)")).toEqual([]);
  });

  it("blocked organizers' events disappear and can't be joined", async () => {
    const id = await create(A);
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);
    expect(await q(B, "select * from public.public_events")).toEqual([]);
    expect(await fails(B, "select public.rsvp_event($1, 'going')", [id])).toMatch(/not_found/);
  });
});
