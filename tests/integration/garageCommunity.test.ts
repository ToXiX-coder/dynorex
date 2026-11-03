import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** D-58: maintenance log, room chat, private clubs, event coordinates, saves, achievements, vehicle gallery. */
const A = "00000000-0000-4000-8000-0000000007a1";
const B = "00000000-0000-4000-8000-0000000007b1";
const C = "00000000-0000-4000-8000-0000000007c1";
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
const vehicle = async (uid = A) =>
  (
    await one<{ id: string }>(
      uid,
      "insert into public.vehicles (year, make, model) values (2015, 'Subaru', 'WRX') returning id",
    )
  ).id;
const club = async (uid = A, name = "Sample Night Club") =>
  (await one<{ id: string }>(uid, "select public.create_club($1, null) as id", [name])).id;
const event = async (uid = A) =>
  (
    await one<{ id: string }>(
      uid,
      `insert into public.events (title, starts_at, ends_at, location_text, place_lat, place_lng)
       values ('Sample meet', now() + interval '1 day', now() + interval '1 day 2 hours', 'Sample lot', 34.05, -118.25)
       returning id`,
    )
  ).id;

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "garage_a"],
    [B, "garage_b"],
    [C, "garage_c"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("maintenance log", () => {
  it("owner-only, on your own vehicles, never public", async () => {
    const v = await vehicle();
    await q(
      A,
      `insert into public.maintenance_records (vehicle_id, title, done_on, odometer, next_due_on, next_due_odometer)
       values ($1, 'Oil change', current_date, 61000, current_date + 180, 66000)`,
      [v],
    );
    expect(await q(A, "select title, next_due_odometer from public.maintenance_records")).toEqual([
      { title: "Oil change", next_due_odometer: 66000 },
    ]);
    expect(await q(B, "select * from public.maintenance_records")).toEqual([]);
    expect(
      await fails(
        B,
        "insert into public.maintenance_records (vehicle_id, title, done_on) values ($1, 'Sneaky', current_date)",
        [v],
      ),
    ).toMatch(/row-level security/);
    // next due must come after the work
    expect(
      await fails(
        A,
        "insert into public.maintenance_records (vehicle_id, title, done_on, odometer, next_due_odometer) values ($1, 'Tires', current_date, 5000, 4000)",
        [v],
      ),
    ).toMatch(/check/);
    const { id } = await one<{ id: string }>(A, "select id from public.maintenance_records");
    await q(A, "select public.soft_delete_maintenance($1)", [id]);
    expect(await q(A, "select * from public.maintenance_records")).toEqual([]);
  });
});

describe("private clubs", () => {
  it("ask to join, staff approve, posts members-only, moderators and removal", async () => {
    const id = await club();
    await q(A, "update public.clubs set visibility = 'private' where id = $1", [id]);
    await q(A, "insert into public.posts (body, club_id) values ('Members only plan', $1)", [id]);
    // listed, but its posts aren't visible to outsiders
    expect(await q(null, "select name, visibility from public.public_clubs")).toEqual([
      { name: "Sample Night Club", visibility: "private" },
    ]);
    expect(await q(B, "select * from public.public_posts")).toEqual([]);
    // the fast feed applies the same rule: not in "Everyone", not via following the author
    await q(B, "insert into public.follows (followee_id) values ($1)", [A]);
    expect(await q(B, "select * from public.paddock_feed('all', 0)")).toEqual([]);
    expect(await q(B, "select * from public.paddock_feed('following', 0)")).toEqual([]);
    expect(await q(null, "select * from public.paddock_feed('all', 0)")).toEqual([]);
    expect(await fails(B, "select public.join_club($1)", [id])).toMatch(/club_private/);
    expect(await one(B, "select public.join_or_request_club($1) as s", [id])).toEqual({ s: "requested" });
    expect(await one(B, "select public.my_club_status($1) as s", [id])).toEqual({ s: "requested" });
    expect(await q(C, "select * from public.club_join_requests_for($1)", [id])).toEqual([]);
    expect(await q(A, "select username from public.club_join_requests_for($1)", [id])).toEqual([
      { username: "garage_b" },
    ]);
    await q(A, "select public.respond_join_request($1, 'garage_b', true)", [id]);
    expect(await q(B, "select body from public.public_posts")).toEqual([{ body: "Members only plan" }]);
    expect(await q(B, "select body from public.paddock_feed('all', 0)")).toEqual([{ body: "Members only plan" }]);
    // moderators approve and remove plain members, not the owner
    await q(A, "select public.set_club_role($1, 'garage_b', 'moderator')", [id]);
    await q(C, "select public.join_or_request_club($1)", [id]);
    await q(B, "select public.respond_join_request($1, 'garage_c', true)", [id]);
    expect(await q(B, "select username, role from public.club_member_list($1)", [id])).toEqual([
      { username: "garage_a", role: "owner" },
      { username: "garage_b", role: "moderator" },
      { username: "garage_c", role: "member" },
    ]);
    expect(await one(B, "select public.remove_club_member($1, 'garage_a') as ok", [id])).toEqual({ ok: false });
    expect(await one(B, "select public.remove_club_member($1, 'garage_c') as ok", [id])).toEqual({ ok: true });
    expect(await fails(C, "select public.set_club_role($1, 'garage_c', 'moderator')", [id])).toMatch(/not_found/);
    expect(await q(C, "select * from public.club_member_list($1)", [id])).toEqual([]);
  });
});

describe("room chat", () => {
  it("club members and event RSVPs only; senders and staff can remove", async () => {
    const id = await club();
    expect(await fails(B, "select public.send_room_message('club', $1, 'hi')", [id])).toMatch(/not_in_room/);
    await q(B, "select public.join_or_request_club($1)", [id]);
    await q(B, "select public.send_room_message('club', $1, 'ETA 10 minutes')", [id]);
    await q(A, "select public.send_room_message('club', $1, 'Meet at the north lot')", [id]);
    expect(
      await q(A, "select sender_username, body, mine, can_remove from public.room_messages_for('club', $1)", [id]),
    ).toEqual([
      { sender_username: "garage_b", body: "ETA 10 minutes", mine: false, can_remove: true },
      { sender_username: "garage_a", body: "Meet at the north lot", mine: true, can_remove: true },
    ]);
    expect(await q(C, "select * from public.room_messages_for('club', $1)", [id])).toEqual([]);
    const { message_id } = await one<{ message_id: string }>(
      B,
      "select message_id from public.room_messages_for('club', $1) where mine",
      [id],
    );
    expect(await one(C, "select public.remove_room_message($1) as ok", [message_id])).toEqual({ ok: false });
    expect(await one(A, "select public.remove_room_message($1) as ok", [message_id])).toEqual({ ok: true });

    const ev = await event();
    expect(await fails(B, "select public.send_room_message('event', $1, 'hi')", [ev])).toMatch(/not_in_room/);
    await q(B, "select public.rsvp_event($1, 'going')", [ev]);
    await q(B, "select public.send_room_message('event', $1, 'Bringing the WRX')", [ev]);
    expect(await q(A, "select body from public.room_messages_for('event', $1)", [ev])).toEqual([
      { body: "Bringing the WRX" },
    ]);
    // blocking hides their messages
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);
    expect(await q(A, "select body from public.room_messages_for('event', $1)", [ev])).toEqual([]);
  });
});

describe("events map, saves, achievements, gallery", () => {
  it("events carry the picked place's coordinates (both or neither)", async () => {
    await event();
    expect(await q(null, "select place_lat, place_lng from public.public_events")).toEqual([
      { place_lat: 34.05, place_lng: -118.25 },
    ]);
    expect(
      await fails(
        A,
        "insert into public.events (title, starts_at, ends_at, location_text, place_lat) values ('x', now() + interval '1 day', now() + interval '1 day 1 hour', 'y', 1)",
      ),
    ).toMatch(/events_place_pair/);
  });

  it("saves are private to you", async () => {
    const ev = await event();
    await q(B, "insert into public.saves (kind, target_id) values ('event', $1)", [ev]);
    expect(await q(B, "select kind from public.saves")).toEqual([{ kind: "event" }]);
    expect(await q(C, "select * from public.saves")).toEqual([]);
    expect(await fails(B, "insert into public.saves (kind, target_id) values ('vin', $1)", [ev])).toMatch(/check/);
    await q(B, "delete from public.saves where target_id = $1", [ev]);
    expect(await q(B, "select * from public.saves")).toEqual([]);
  });

  it("achievements come from public activity only", async () => {
    await club();
    expect(await q(null, "select id from public.achievements('garage_a')")).toEqual([{ id: "club_founder" }]);
    expect(await q(null, "select id from public.achievements('garage_b')")).toEqual([]);
    expect(await q(null, "select id from public.achievements('nobody_here')")).toEqual([]);
  });

  it("gallery photos are written only by the server and shown only for public vehicles", async () => {
    const v = await vehicle();
    expect(
      await fails(
        A,
        "insert into public.vehicle_photos (owner_id, vehicle_id, storage_path, mime, bytes) values ($1, $2, 'x', 'image/jpeg', 1)",
        [A, v],
      ),
    ).toMatch(/permission denied/);
    await db.query(
      "insert into public.vehicle_photos (owner_id, vehicle_id, storage_path, mime, bytes) values ($1, $2, 'a/b.jpg', 'image/jpeg', 10)",
      [A, v],
    );
    expect(await q(null, "select * from public.public_vehicle_photos")).toEqual([]);
    expect(await q(A, "select storage_path from public.vehicle_photos")).toEqual([{ storage_path: "a/b.jpg" }]);
  });
});
