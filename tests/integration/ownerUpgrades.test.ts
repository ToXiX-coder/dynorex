import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

/** D-61: odometer from the log, receipts, service history links, event albums, alerts, road reviews, club meets. */
const A = "00000000-0000-4000-8000-0000000009a1";
const B = "00000000-0000-4000-8000-0000000009b1";
const C = "00000000-0000-4000-8000-0000000009c1";
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

async function car(uid: string, odometer: number | null = 50000, unit = "mi") {
  const { id } = await one<{ id: string }>(
    uid,
    `insert into public.vehicles (year, make, model, visibility, odometer, odometer_unit, vin)
     values (2017, 'Subaru', 'WRX', 'public', $1, $2::public.odometer_unit, 'JF1VA1A60H9800001') returning id`,
    [odometer, unit],
  );
  await q(uid, `insert into public.builds (vehicle_id, title, visibility) values ($1, 'Build', 'public')`, [id]);
  return id;
}
const service = (uid: string, vehicle: string, odometer: number | null, title = "Oil change") =>
  one<{ id: string }>(
    uid,
    `insert into public.maintenance_records (vehicle_id, title, done_on, odometer, cost_minor, notes)
     values ($1, $2, current_date, $3, 4900, 'Shop: secret garage') returning id`,
    [vehicle, title, odometer],
  );
const odo = async (uid: string, v: string) =>
  (await one<{ odometer: number | null }>(uid, "select odometer from public.vehicles where id = $1", [v])).odometer;
const notes = (uid: string, category: string) =>
  q<{ title: string; body: string; entity_id: string }>(
    uid,
    "select title, body, entity_id from public.notifications where category = $1::public.notification_category",
    [category],
  );

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "owner_a9"],
    [B, "owner_b9"],
    [C, "owner_c9"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("odometer follows the maintenance log", () => {
  it("moves up with a higher reading, never down, and only for cars in miles", async () => {
    await grantPlus(db, A); // three cars here; the free plan allows two
    const v = await car(A, 50000);
    await service(A, v, 52000);
    expect(await odo(A, v)).toBe(52000);
    await service(A, v, 30000, "Old job"); // an old record doesn't wind it back
    expect(await odo(A, v)).toBe(52000);
    const empty = await car(A, null);
    await service(A, empty, 1200);
    expect(await odo(A, empty)).toBe(1200);
    const km = await car(A, 80000, "km");
    await service(A, km, 90000);
    expect(await odo(A, km)).toBe(80000);
    // nobody else can log on your car, so nobody else can move it
    expect(
      await fails(
        B,
        "insert into public.maintenance_records (vehicle_id, title, done_on, odometer) values ($1, 'x x', current_date, 99999)",
        [v],
      ),
    ).toMatch(/row-level security/);
  });
});

describe("receipts", () => {
  it("are written by the server only and read by their owner only", async () => {
    const v = await car(A);
    const m = await service(A, v, 51000);
    expect(
      await fails(
        A,
        "insert into public.receipts (owner_id, vehicle_id, maintenance_id, storage_path, mime, bytes) values ($1, $2, $3, 'p', 'image/jpeg', 1)",
        [A, v, m.id],
      ),
    ).toMatch(/permission denied/);
    await db.query(
      "insert into public.receipts (owner_id, vehicle_id, maintenance_id, storage_path, mime, bytes) values ($1, $2, $3, 'a/r.jpg', 'image/jpeg', 1)",
      [A, v, m.id],
    );
    // exactly one of mod / maintenance
    await expect(
      db.query(
        "insert into public.receipts (owner_id, vehicle_id, storage_path, mime, bytes) values ($1, $2, 'a/x.jpg', 'image/jpeg', 1)",
        [A, v],
      ),
    ).rejects.toThrow(/check/);
    expect(await q(A, "select storage_path from public.receipts")).toEqual([{ storage_path: "a/r.jpg" }]);
    expect(await q(B, "select * from public.receipts")).toEqual([]);
    expect(await fails(null, "select * from public.receipts")).toMatch(/permission denied/);
    const { id } = await one<{ id: string }>(A, "select id from public.receipts");
    expect(await one(B, "select public.soft_delete_receipt($1) as ok", [id])).toEqual({ ok: false });
    expect(await one(A, "select public.soft_delete_receipt($1) as ok", [id])).toEqual({ ok: true });
    expect(await q(A, "select * from public.receipts")).toEqual([]);
  });
});

describe("service history links", () => {
  it("show the work but never the VIN, costs, notes or owner, and stop when revoked or replaced", async () => {
    const v = await car(A, 50000);
    const m = await service(A, v, 51000);
    await q(
      A,
      "insert into public.mods (vehicle_id, name, category, brand, status, part_number, notes) values ($1, 'Cat-back', 'exhaust', 'Invidia', 'complete', 'PN-1', 'secret note')",
      [v],
    );
    await q(
      A,
      "insert into public.mods (vehicle_id, name, category, status) values ($1, 'Turbo', 'engine', 'planned')",
      [v],
    );
    await db.query(
      "insert into public.receipts (owner_id, vehicle_id, maintenance_id, storage_path, mime, bytes) values ($1, $2, $3, 'a/r.jpg', 'image/jpeg', 1)",
      [A, v, m.id],
    );
    expect(await fails(B, "select public.create_history_share($1)", [v])).toMatch(/not_found/);
    const { token } = await one<{ token: string }>(A, "select public.create_history_share($1) as token", [v]);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const { h } = await one<{ h: Record<string, unknown> }>(null, "select public.service_history($1) as h", [token]);
    expect(h).toMatchObject({ make: "Subaru", model: "WRX", odometer: 51000 });
    expect(h.mods).toEqual([expect.objectContaining({ name: "Cat-back", brand: "Invidia", receipt: false })]);
    expect(h.maintenance).toEqual([expect.objectContaining({ title: "Oil change", odometer: 51000, receipt: true })]);
    const text = JSON.stringify(h);
    for (const secret of ["JF1VA1A60H9800001", "4900", "secret", "PN-1", A, "owner_a9", "a/r.jpg"])
      expect(text).not.toContain(secret);

    // a wrong or malformed token tells nothing
    expect(await one(null, "select public.service_history($1) as h", ["0".repeat(64)])).toEqual({ h: null });
    expect(await one(null, "select public.service_history($1) as h", ["x"])).toEqual({ h: null });
    // a new link replaces the old one; revoking ends it
    const { token: t2 } = await one<{ token: string }>(A, "select public.create_history_share($1) as token", [v]);
    expect(await one(null, "select public.service_history($1) as h", [token])).toEqual({ h: null });
    expect((await q(A, "select token from public.my_history_share($1)", [v]))[0]).toEqual({ token: t2 });
    expect(await q(B, "select token from public.my_history_share($1)", [v])).toEqual([]);
    await q(A, "select public.revoke_history_share($1)", [v]);
    expect(await one(null, "select public.service_history($1) as h", [t2])).toEqual({ h: null });
    // expired links are dead too
    const { token: t3 } = await one<{ token: string }>(A, "select public.create_history_share($1) as token", [v]);
    await db.query("update app_private.history_shares set expires_at = now() - interval '1 minute'");
    expect(await one(null, "select public.service_history($1) as h", [t3])).toEqual({ h: null });
    // the share table itself is out of reach
    expect(await fails(A, "select * from app_private.history_shares")).toMatch(/permission denied/);
  });
});

describe("event photo albums", () => {
  async function event(startsIn: string) {
    // start times in the past are refused, so a started event is made with that check paused
    await db.exec("alter table public.events disable trigger events_times");
    const { id } = await db
      .query<{ id: string }>(
        `insert into public.events (organizer_id, title, starts_at, ends_at, location_text)
       values ($1, 'Meet', now() + $2::interval, now() + $2::interval + interval '2 hours', 'Lot') returning id`,
        [A, startsIn],
      )
      .then((r) => r.rows[0]!);
    await db.exec("alter table public.events enable trigger events_times");
    return id;
  }

  it("host and people who went can add; the host or uploader can remove; blocks hide photos", async () => {
    const ev = await event("-1 hour");
    await db.query("insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'going')", [ev, B]);
    const can = async (uid: string) =>
      (await one<{ ok: boolean }>(uid, "select public.can_add_event_photo($1) as ok", [ev])).ok;
    expect(await can(A)).toBe(true);
    expect(await can(B)).toBe(true);
    expect(await can(C)).toBe(false); // didn't go
    expect(await fails(null, "select public.can_add_event_photo($1)", [ev])).toMatch(/permission denied/);
    // a meet two days away has no album yet
    expect(
      (await one<{ ok: boolean }>(A, "select public.can_add_event_photo($1) as ok", [await event("2 days")])).ok,
    ).toBe(false);

    expect(
      await fails(
        B,
        "insert into public.event_photos (event_id, owner_id, storage_path, mime, bytes) values ($1, $2, 'p', 'image/jpeg', 1)",
        [ev, B],
      ),
    ).toMatch(/permission denied/);
    const { id: photo } = await db
      .query<{ id: string }>(
        "insert into public.event_photos (event_id, owner_id, storage_path, mime, bytes) values ($1, $2, 'b/1.jpg', 'image/jpeg', 1) returning id",
        [ev, B],
      )
      .then((r) => r.rows[0]!);
    // the raw rows (with storage paths) are the uploader's alone
    expect(await q(A, "select * from public.event_photos")).toEqual([]);
    expect(await q(B, "select storage_path from public.event_photos")).toEqual([{ storage_path: "b/1.jpg" }]);
    const album = await q(null, "select photo_id, owner_username from public.public_event_photos");
    expect(album).toEqual([{ photo_id: photo, owner_username: "owner_b9" }]);
    expect(await q(null, "select * from public.public_event_photos")).not.toContainEqual(
      expect.objectContaining({ storage_path: expect.anything() }),
    );
    // blocking the uploader hides their photo from you
    await q(C, "insert into public.blocks (blocked_id) values ($1)", [B]);
    expect(await q(C, "select * from public.public_event_photos")).toEqual([]);
    // C can't remove it; the host can
    expect(await one(C, "select public.remove_event_photo($1) as ok", [photo])).toEqual({ ok: false });
    expect(await q(A, "select * from public.my_removable_event_photos($1) as id", [ev])).toEqual([{ id: photo }]);
    expect(await one(A, "select public.remove_event_photo($1) as ok", [photo])).toEqual({ ok: true });
    expect(await q(null, "select * from public.public_event_photos")).toEqual([]);
  });

  it("closes a week after the event and on cancelled events", async () => {
    const old = await event("-10 days");
    expect((await one<{ ok: boolean }>(A, "select public.can_add_event_photo($1) as ok", [old])).ok).toBe(false);
    const ev = await event("-30 minutes");
    await db.query("update public.events set status = 'cancelled' where id = $1", [ev]);
    expect((await one<{ ok: boolean }>(A, "select public.can_add_event_photo($1) as ok", [ev])).ok).toBe(false);
  });
});

describe("like and comment alerts", () => {
  it("tell the author once, never for their own post, and respect blocks and the switch", async () => {
    const { id: post } = await one<{ id: string }>(
      A,
      "insert into public.posts (body) values ('New wheels') returning id",
    );
    await q(B, "insert into public.post_likes (post_id) values ($1)", [post]);
    await q(A, "insert into public.post_likes (post_id) values ($1)", [post]); // own like: nothing
    await q(B, "insert into public.comments (post_id, body) values ($1, 'Clean!')", [post]);
    await q(B, "insert into public.comments (post_id, body) values ($1, 'Again')", [post]); // within the hour: one alert
    expect(await notes(A, "post_like")).toEqual([
      { title: "New like", body: "@owner_b9 liked your post.", entity_id: post },
    ]);
    expect(await notes(A, "post_comment")).toEqual([
      { title: "New comment", body: "@owner_b9 commented on your post.", entity_id: post },
    ]);
    // the comment's words never ride along
    expect(JSON.stringify(await notes(A, "post_comment"))).not.toContain("Clean");
    // C is blocked by A: no alert; then A turns likes off entirely
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [C]);
    await db.query("insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, C]);
    await q(A, "select public.set_notification_pref('post_like', false)");
    await q(B, "delete from public.post_likes where post_id = $1", [post]);
    await db.query("delete from public.notifications where category = 'post_like'");
    await q(B, "insert into public.post_likes (post_id) values ($1)", [post]);
    expect(await notes(A, "post_like")).toEqual([]);
  });
});

describe("road reviews", () => {
  const track = () =>
    JSON.stringify(
      Array.from({ length: 46 }, (_, i) => [40 + i * 0.001, -74, Date.parse("2026-10-01T08:00:00Z") + i * 10_000]),
    );

  it("aspects average per route; written reviews show the reviewer, minus blocked people", async () => {
    const { id: route } = await one<{ id: string }>(
      A,
      "select public.save_route('00000000-0000-4000-8000-00000000f001', 'Canyon', null, $1::jsonb, true) as id",
      [track()],
    );
    await q(
      B,
      "insert into public.route_ratings (route_id, stars, scenery, surface, traffic, comment) values ($1, 5, 5, 4, 3, 'Great at sunrise')",
      [route],
    );
    await q(
      C,
      "insert into public.route_ratings (route_id, stars, scenery, surface, traffic) values ($1, 3, 3, 2, 5)",
      [route],
    );
    expect(await fails(B, "update public.route_ratings set scenery = 9 where route_id = $1", [route])).toMatch(/check/);
    const s = await one<Record<string, string | number>>(null, "select * from public.route_review_summary($1)", [
      route,
    ]);
    expect(Number(s.reviews)).toBe(2);
    expect(Number(s.scenery)).toBe(4);
    expect(Number(s.surface)).toBe(3);
    expect(Number(s.traffic)).toBe(4);
    expect(await q(null, "select username, comment from public.route_reviews($1)", [route])).toEqual([
      { username: "owner_b9", comment: "Great at sunrise" },
    ]);
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);
    expect(await q(A, "select * from public.route_reviews($1)", [route])).toEqual([]);
    // a private route has no reviews to show
    await q(A, "select public.set_route_public($1, false)", [route]);
    expect(await q(null, "select * from public.route_reviews($1)", [route])).toEqual([]);
  });
});

describe("club calendar alerts", () => {
  it("tell members (not the host) about a new club meet", async () => {
    const { id: club } = await one<{ id: string }>(A, "select public.create_club('Canyon crew', null) as id");
    await q(B, "select public.join_club($1)", [club]);
    await q(
      A,
      `insert into public.events (title, starts_at, ends_at, location_text, club_id)
       values ('Sunday run', now() + interval '3 days', now() + interval '3 days 2 hours', 'Lot', $1)`,
      [club],
    );
    expect(await notes(B, "club_event")).toEqual([expect.objectContaining({ title: "New in Canyon crew" })]);
    expect(await notes(A, "club_event")).toEqual([]);
    expect(await notes(C, "club_event")).toEqual([]);
  });
});
