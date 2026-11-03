import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** D-60: performance runs, owner fitment, repeating meets, live group drive. */
const A = "00000000-0000-4000-8000-0000000008a1";
const B = "00000000-0000-4000-8000-0000000008b1";
const C = "00000000-0000-4000-8000-0000000008c1";
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
const one = async <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) =>
  (await q<T>(uid, sql, params))[0]!;

/** A car with a build; public unless told otherwise. */
async function car(uid: string, visibility: "public" | "private" = "public", year = 2017, model = "WRX") {
  const { id } = await one<{ id: string }>(
    uid,
    `insert into public.vehicles (year, make, model, visibility) values ($1, 'Subaru', $2, $3) returning id`,
    [year, model, visibility],
  );
  await q(uid, `insert into public.builds (vehicle_id, title, visibility) values ($1, 'Build', $2)`, [id, visibility]);
  return id;
}
const mod = (uid: string, vehicle: string, name: string, brand: string | null, status = "complete") =>
  q(uid, `insert into public.mods (vehicle_id, name, category, brand, status) values ($1, $2, 'exhaust', $3, $4)`, [
    vehicle,
    name,
    brand,
    status,
  ]);

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "prove_a"],
    [B, "prove_b"],
    [C, "prove_c"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("performance runs", () => {
  const insert = `insert into public.perf_runs (vehicle_id, zero_sixty_s, quarter_s, trap_mph, est_whp, weight_lb,
                    sample_hz, quality, shared, samples)
                  values ($1, 5.4, 13.9, 101.2, 268, 3400, 10, 'good', $2, '[[0,0],[5400,60]]') returning id`;

  it("owner-only rows; shared runs on public builds show numbers but never the trace", async () => {
    const v = await car(A);
    await q(A, insert, [v, true]);
    await q(A, insert, [v, false]);
    expect(await q(A, "select zero_sixty_s from public.perf_runs")).toHaveLength(2);
    expect(await q(B, "select * from public.perf_runs")).toEqual([]);
    const pub = await q(null, "select * from public.public_perf_runs");
    expect(pub).toHaveLength(1);
    expect(pub[0]).not.toHaveProperty("samples");
    expect(Number(pub[0]!.zero_sixty_s)).toBe(5.4);
    // someone else can't log a run on your car
    expect(await fails(B, insert, [v, false])).toMatch(/row-level security/);
  });

  it("private builds never show runs, and deleted runs disappear", async () => {
    const v = await car(A, "private");
    const { id } = await one<{ id: string }>(A, insert, [v, true]);
    expect(await q(null, "select * from public.public_perf_runs")).toEqual([]);
    await q(A, "select public.soft_delete_perf_run($1)", [id]);
    expect(await q(A, "select * from public.perf_runs")).toEqual([]);
  });

  it("refuses impossible numbers and half a quarter mile", async () => {
    const v = await car(A);
    expect(
      await fails(
        A,
        "insert into public.perf_runs (vehicle_id, zero_sixty_s, sample_hz, quality) values ($1, 0.9, 10, 'good')",
        [v],
      ),
    ).toMatch(/check/);
    expect(
      await fails(
        A,
        "insert into public.perf_runs (vehicle_id, quarter_s, sample_hz, quality) values ($1, 12.5, 10, 'good')",
        [v],
      ),
    ).toMatch(/check/);
    expect(
      await fails(
        A,
        "insert into public.perf_runs (vehicle_id, zero_sixty_s, sample_hz, quality) values ($1, 5, 10, 'verified')",
        [v],
      ),
    ).toMatch(/check/);
  });
});

describe("owner fitment", () => {
  it("counts owners of the same car (±3 years) from public builds only", async () => {
    const a = await car(A, "public", 2016);
    const b = await car(B, "public", 2019);
    const far = await car(C, "public", 2008);
    const hidden = await car(C, "private", 2017);
    await mod(A, a, "Cat-back exhaust", "Invidia");
    await mod(B, b, "cat-back exhaust", "invidia");
    await mod(B, b, "Downpipe", "Cobb", "planned"); // not installed yet: not counted
    await mod(C, far, "Cat-back exhaust", "Invidia"); // too old a model year
    await mod(C, hidden, "Cat-back exhaust", "Invidia"); // private build
    const rows = await q<{ name: string; owners: number; vehicle_ids: string[] }>(
      null,
      "select * from public.owner_fitment('subaru', 'wrx', 2017)",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owners).toBe(2);
    expect(rows[0]!.vehicle_ids.sort()).toEqual([a, b].sort());
    // search terms narrow it; unrelated words find nothing
    expect(
      await q(null, "select * from public.owner_fitment('Subaru', 'WRX', 2017, 'exhaust', 'invidia catback')"),
    ).toHaveLength(1);
    expect(await q(null, "select * from public.owner_fitment('Subaru', 'WRX', 2017, null, 'turbo')")).toEqual([]);
  });

  it("leaves out owners you've blocked", async () => {
    const b = await car(B);
    await mod(B, b, "Coilovers", "BC Racing");
    expect(await q(A, "select * from public.owner_fitment('Subaru', 'WRX', 2017)")).toHaveLength(1);
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);
    expect(await q(A, "select * from public.owner_fitment('Subaru', 'WRX', 2017)")).toEqual([]);
  });
});

describe("repeating meets", () => {
  const series = (uid: string, count: number, repeat = "weekly") =>
    one<{ s: string }>(
      uid,
      `select public.create_event_series('Sunday Cars & Coffee', null, now() + interval '1 day',
         now() + interval '1 day 2 hours', 'Sample lot', null, 'meet', null, null, null, null, $1, $2) as s`,
      [repeat, count],
    );

  it("creates every date as its own event, a week apart, counting as one creation", async () => {
    const { s } = await series(A, 8);
    const rows = await q<{ id: string; starts_at: string }>(
      A,
      "select id, starts_at from public.events where series_id = $1 order by starts_at",
      [s],
    );
    expect(rows).toHaveLength(8);
    const gap = Date.parse(rows[1]!.starts_at) - Date.parse(rows[0]!.starts_at);
    expect(gap).toBe(7 * 86400_000);
    // the public list of other dates
    expect(await q(null, "select * from public.event_series_dates($1)", [rows[0]!.id])).toHaveLength(8);
    // 8 dates used one of the five daily creations: four single events still fit, a fifth doesn't
    for (let i = 0; i < 4; i++)
      await q(
        A,
        `insert into public.events (title, starts_at, ends_at, location_text)
         values ('One-off', now() + interval '2 days', now() + interval '2 days 1 hour', 'Lot')`,
      );
    expect(
      await fails(
        A,
        `insert into public.events (title, starts_at, ends_at, location_text)
         values ('Too many', now() + interval '2 days', now() + interval '2 days 1 hour', 'Lot')`,
      ),
    ).toMatch(/rate_limited/);
  });

  it("checks its input and can cancel from one date onward", async () => {
    expect(
      await fails(
        A,
        "select public.create_event_series('x', null, now() + interval '1 day', now() + interval '1 day 1 hour', 'Lot', null, 'meet', null, null, null, null, 'daily', 4)",
      ),
    ).toMatch(/invalid_input/);
    expect(
      await fails(
        A,
        "select public.create_event_series('x', null, now() + interval '1 day', now() + interval '1 day 1 hour', 'Lot', null, 'meet', null, null, null, null, 'weekly', 13)",
      ),
    ).toMatch(/invalid_input/);
    const { s } = await series(A, 4, "monthly");
    const dates = await q<{ id: string }>(A, "select id from public.events where series_id = $1 order by starts_at", [
      s,
    ]);
    expect(await fails(B, "select public.cancel_event_series($1)", [dates[1]!.id])).toMatch(/not_found/);
    expect(await one(A, "select public.cancel_event_series($1) as n", [dates[1]!.id])).toEqual({ n: 3 });
    expect(await q(A, "select status from public.events where series_id = $1 order by starts_at", [s])).toEqual([
      { status: "scheduled" },
      { status: "cancelled" },
      { status: "cancelled" },
      { status: "cancelled" },
    ]);
  });
});

describe("live group drive", () => {
  async function drive(startsIn = "20 minutes") {
    // drives need a public route; the route link itself is covered by phase 7b tests
    await db.exec("alter table public.events disable trigger events_links");
    const { id } = await one<{ id: string }>(
      A,
      `insert into public.events (title, starts_at, ends_at, location_text, kind)
       values ('Canyon run', now() + $1::interval, now() + $1::interval + interval '2 hours', 'Lot', 'drive') returning id`,
      [startsIn],
    );
    await db.exec("alter table public.events enable trigger events_links");
    return id;
  }

  it("only the drive's people see positions, and only while it is on", async () => {
    const ev = await drive();
    await q(B, "select public.rsvp_event($1, 'going')", [ev]);
    await q(A, "select public.share_drive_position($1, 34.05, -118.25, 90)", [ev]);
    await q(B, "select public.share_drive_position($1, 34.06, -118.24, null)", [ev]);
    const seen = await q<{ username: string; mine: boolean }>(
      B,
      "select username, mine from public.drive_positions_for($1)",
      [ev],
    );
    expect(seen).toEqual([
      { username: "prove_a", mine: false },
      { username: "prove_b", mine: true },
    ]);
    // not going: can't share, sees nothing; the table itself is never readable
    expect(await fails(C, "select public.share_drive_position($1, 1, 1)", [ev])).toMatch(/drive_not_live/);
    expect(await q(C, "select * from public.drive_positions_for($1)", [ev])).toEqual([]);
    expect(await fails(B, "select * from public.drive_positions")).toMatch(/permission denied/);
    // stop sharing removes your dot
    await q(B, "select public.stop_sharing_drive($1)", [ev]);
    expect(await q(A, "select username from public.drive_positions_for($1)", [ev])).toEqual([{ username: "prove_a" }]);
  });

  it("refuses before the drive window opens and for meets", async () => {
    const later = await drive("2 days");
    expect(await fails(A, "select public.share_drive_position($1, 1, 1)", [later])).toMatch(/drive_not_live/);
    const { id: meet } = await one<{ id: string }>(
      A,
      `insert into public.events (title, starts_at, ends_at, location_text)
       values ('Meet', now() + interval '10 minutes', now() + interval '2 hours', 'Lot') returning id`,
    );
    expect(await fails(A, "select public.share_drive_position($1, 1, 1)", [meet])).toMatch(/drive_not_live/);
  });

  it("hides blocked people's dots", async () => {
    const ev = await drive();
    await q(B, "select public.rsvp_event($1, 'going')", [ev]);
    await q(B, "select public.share_drive_position($1, 34.06, -118.24)", [ev]);
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);
    expect(await q(A, "select * from public.drive_positions_for($1)", [ev])).toEqual([]);
  });
});
