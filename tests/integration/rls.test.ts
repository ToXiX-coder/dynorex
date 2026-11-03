import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, grantPlus, ids, setUsername } from "./db";

const { alice, bob, carol } = ids;
const VIN = "1HGCM82633A004352";
let db: PGlite;

const rows = async (tx: Transaction, sql: string, params: unknown[] = []) => (await tx.query(sql, params)).rows;
const one = async <T = Record<string, unknown>>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;

/** Expect a statement to fail; returns the Postgres error message. */
async function denied(uid: string | null, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await as(db, uid, (tx) => tx.query(sql, params));
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`Expected failure but it succeeded: ${sql}`);
}

let aliceVehicle: string;
let alicePublicVehicle: string;
let alicePublicBuild: string;
let aliceMod: string;

beforeAll(async () => {
  db = await freshDb();
  await createAuthUser(db, alice, true);
  await createAuthUser(db, bob, false); // unverified
  await createAuthUser(db, carol, true);
  for (const [uid, name] of [
    [alice, "alice_builds"],
    [bob, "bob_garage"],
    [carol, "carol_r"],
  ] as const) {
    await setUsername(db, uid, name); // profile row is created by the sign-up trigger
  }
  await grantPlus(db, alice); // these tests create more than the free 2 vehicles
  await as(db, alice, async (tx) => {
    aliceVehicle = (
      await one<{ id: string }>(
        tx,
        "insert into public.vehicles (year, make, model, vin, odometer) values (2004, 'Sample', 'Private Car', $1, 90000) returning id",
        [VIN],
      )
    ).id;
    alicePublicVehicle = (
      await one<{ id: string }>(
        tx,
        "insert into public.vehicles (year, make, model, vin, visibility) values (1999, 'Sample', 'Public Car', $1, 'public') returning id",
        [VIN],
      )
    ).id;
    alicePublicBuild = (
      await one<{ id: string }>(
        tx,
        "insert into public.builds (vehicle_id, title, visibility) values ($1, 'Public build', 'public') returning id",
        [alicePublicVehicle],
      )
    ).id;
    aliceMod = (
      await one<{ id: string }>(
        tx,
        "insert into public.mods (vehicle_id, name, category, status, cost_minor, currency, notes) values ($1, 'Coilovers', 'suspension', 'complete', 125000, 'USD', 'private note') returning id",
        [alicePublicVehicle],
      )
    ).id;
    await tx.query("insert into public.mods (vehicle_id, name, category) values ($1, 'Secret mod', 'engine')", [
      aliceVehicle,
    ]);
  });
});

describe("users", () => {
  it("sees only your own row; other profiles come from the public view without private columns", async () => {
    const mine = await as(db, alice, (tx) => rows(tx, "select id from public.users"));
    expect(mine).toEqual([{ id: alice }]);
    const pub = await as(db, null, (tx) =>
      rows(tx, "select * from public.public_profiles where username = 'alice_builds'"),
    );
    expect(pub).toHaveLength(1);
    expect(Object.keys(pub[0] as object)).not.toContain("default_visibility");
    expect(JSON.stringify(pub)).not.toContain("example.test");
  });

  it("rejects writes to reputation, badges, ids and other people's rows", async () => {
    expect(await denied(alice, "update public.users set reputation = 9999 where id = $1", [alice])).toMatch(
      /permission denied/,
    );
    expect(await denied(alice, "update public.users set business_badge = true where id = $1", [alice])).toMatch(
      /permission denied/,
    );
    const r = await as(db, alice, (tx) => tx.query("update public.users set bio = 'x' where id = $1", [bob]));
    expect(r.affectedRows).toBe(0);
    // clients can't create profile rows at all (the sign-up trigger does)
    expect(await denied(carol, "insert into public.users (id, username) values ($1, 'imposter')", [bob])).toMatch(
      /permission denied/,
    );
  });

  it("enforces username rules", async () => {
    await createAuthUser(db, "00000000-0000-4000-8000-0000000000d1", true);
    const u = "00000000-0000-4000-8000-0000000000d1";
    expect(await denied(u, "update public.users set username = 'Admin' where id = $1", [u])).toMatch(
      /check constraint/,
    );
    expect(await denied(u, "update public.users set username = 'admin' where id = $1", [u])).toMatch(
      /check constraint/,
    );
    expect(await denied(u, "update public.users set username = 'ALICE_BUILDS' where id = $1", [u])).toMatch(
      /check constraint/,
    );
    expect(await denied(u, "update public.users set username = 'alice_builds' where id = $1", [u])).toMatch(
      /duplicate|unique/,
    );
  });

  it("anon cannot read base tables", async () => {
    for (const t of [
      "users",
      "vehicles",
      "builds",
      "mods",
      "mod_photos",
      "follows",
      "build_follows",
      "notifications",
    ]) {
      expect(await denied(null, `select * from public.${t}`)).toMatch(/permission denied/);
    }
  });
});

describe("vehicles, builds, mods: ownership", () => {
  it("another user cannot read, update or delete your vehicle or mods", async () => {
    expect(
      await as(db, bob, (tx) => rows(tx, "select id from public.vehicles where id = $1", [aliceVehicle])),
    ).toHaveLength(0);
    expect(await as(db, bob, (tx) => rows(tx, "select id from public.mods where id = $1", [aliceMod]))).toHaveLength(0);
    const upd = await as(db, bob, (tx) =>
      tx.query("update public.vehicles set make = 'pwned' where id = $1", [aliceVehicle]),
    );
    expect(upd.affectedRows).toBe(0);
    const del = await as(db, bob, (tx) =>
      one<{ ok: boolean }>(tx, "select public.soft_delete_vehicle($1) as ok", [aliceVehicle]),
    );
    expect(del.ok).toBe(false);
    expect(await denied(bob, "delete from public.vehicles where id = $1", [aliceVehicle])).toMatch(/permission denied/);
  });

  it("cannot create rows for someone else or attach to their parents", async () => {
    expect(
      await denied(bob, "insert into public.vehicles (owner_id, year, make, model) values ($1, 2000, 'a', 'b')", [
        alice,
      ]),
    ).toMatch(/permission denied/);
    // parent/child substitution: Bob points a mod at Alice's vehicle
    expect(
      await denied(bob, "insert into public.mods (vehicle_id, name, category) values ($1, 'x', 'engine')", [
        aliceVehicle,
      ]),
    ).toMatch(/foreign key/);
    expect(await denied(bob, "insert into public.builds (vehicle_id, title) values ($1, 'x')", [aliceVehicle])).toMatch(
      /foreign key/,
    );
    // Since Phase 3, photo rows are written only by the register-photo Edge Function (after it checks
    // the file), so clients get "permission denied" before any foreign key or path check.
    expect(
      await denied(
        bob,
        "insert into public.mod_photos (mod_id, storage_path, mime, bytes) values ($1, $2, 'image/jpeg', 10)",
        [aliceMod, `${bob}/x.jpg`],
      ),
    ).toMatch(/permission denied/);
    // the database still refuses a path outside the owner's folder, even for trusted server code
    await expect(
      db.query(
        "insert into public.mod_photos (owner_id, mod_id, storage_path, mime, bytes) values ($1, $2, $3, 'image/jpeg', 10)",
        [alice, aliceMod, `${bob}/x.jpg`],
      ),
    ).rejects.toThrow(/check constraint/);
    // and a photo can't point at someone else's mod
    await expect(
      db.query(
        "insert into public.mod_photos (owner_id, mod_id, storage_path, mime, bytes) values ($1, $2, $3, 'image/jpeg', 10)",
        [bob, aliceMod, `${bob}/x.jpg`],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("validates fields in the database too", async () => {
    expect(await denied(alice, "insert into public.vehicles (year, make, model) values (1700, 'a', 'b')")).toMatch(
      /check constraint/,
    );
    expect(
      await denied(alice, "insert into public.vehicles (year, make, model, vin) values (2000, 'a', 'b', 'NOTAVIN')"),
    ).toMatch(/check constraint/);
    expect(
      await denied(
        alice,
        "insert into public.mods (vehicle_id, name, category, cost_minor) values ($1, 'x', 'engine', -1)",
        [aliceVehicle],
      ),
    ).toMatch(/check constraint/);
    expect(
      await denied(
        alice,
        "insert into public.mods (vehicle_id, name, category, cost_minor) values ($1, 'x', 'engine', 100)",
        [aliceVehicle],
      ),
    ).toMatch(/check constraint/);
    expect(
      await denied(alice, "insert into public.mods (vehicle_id, name, category) values ($1, 'x', 'teleporter')", [
        aliceVehicle,
      ]),
    ).toMatch(/invalid input value for enum/);
    expect(
      await denied(
        alice,
        "insert into public.mods (vehicle_id, name, category, spec_deltas) values ($1, 'x', 'engine', '[]')",
        [aliceVehicle],
      ),
    ).toMatch(/check constraint/);
  });

  it("owner can soft delete; deleted rows vanish everywhere", async () => {
    const vid = await as(
      db,
      alice,
      async (tx) =>
        (
          await one<{ id: string }>(
            tx,
            "insert into public.vehicles (year, make, model, visibility) values (2010, 'Temp', 'Gone', 'public') returning id",
          )
        ).id,
    );
    expect(
      await as(db, null, (tx) => rows(tx, "select 1 from public.public_vehicles where vehicle_id = $1", [vid])),
    ).toHaveLength(1);
    expect(
      (await as(db, alice, (tx) => one<{ ok: boolean }>(tx, "select public.soft_delete_vehicle($1) as ok", [vid]))).ok,
    ).toBe(true);
    expect(await as(db, alice, (tx) => rows(tx, "select 1 from public.vehicles where id = $1", [vid]))).toHaveLength(0);
    expect(
      await as(db, null, (tx) => rows(tx, "select 1 from public.public_vehicles where vehicle_id = $1", [vid])),
    ).toHaveLength(0);
  });
});

describe("public views and publishing", () => {
  it("public views never contain VIN, odometer, cost, notes or owner ids", async () => {
    const v = await as(db, null, (tx) => rows(tx, "select * from public.public_vehicles"));
    const m = await as(db, null, (tx) => rows(tx, "select * from public.public_mods"));
    const all = JSON.stringify({ v, m });
    expect(v.map((r) => (r as { vehicle_id: string }).vehicle_id)).toEqual([alicePublicVehicle]);
    expect(all).not.toContain(VIN);
    expect(all).not.toContain("90000");
    expect(all).not.toContain("125000");
    expect(all).not.toContain("private note");
    expect(all).not.toContain(alice);
    expect(all).not.toContain("Secret mod");
    for (const col of ["vin", "odometer", "cost_minor", "notes", "owner_id", "spec_deltas"]) {
      expect(Object.keys((v[0] ?? {}) as object)).not.toContain(col);
      expect(Object.keys((m[0] ?? {}) as object)).not.toContain(col);
    }
  });

  it("a public build on a private vehicle stays hidden (most restrictive wins)", async () => {
    await as(db, alice, (tx) =>
      tx.query("insert into public.builds (vehicle_id, title, visibility) values ($1, 'Hidden', 'public')", [
        aliceVehicle,
      ]),
    );
    const b = await as(db, null, (tx) => rows(tx, "select title from public.public_builds"));
    expect(b).toEqual([{ title: "Public build" }]);
  });

  it("unverified users cannot publish; friends_only is refused until accepted relationships exist", async () => {
    expect(
      await denied(
        bob,
        "insert into public.vehicles (year, make, model, visibility) values (2000, 'a', 'b', 'public')",
      ),
    ).toMatch(/email_not_verified/);
    const vid = await as(
      db,
      bob,
      async (tx) =>
        (
          await one<{ id: string }>(
            tx,
            "insert into public.vehicles (year, make, model) values (2000, 'a', 'b') returning id",
          )
        ).id,
    );
    expect(await denied(bob, "update public.vehicles set visibility = 'public' where id = $1", [vid])).toMatch(
      /email_not_verified/,
    );
    expect(
      await denied(
        alice,
        "insert into public.vehicles (year, make, model, visibility) values (2000, 'a', 'b', 'friends_only')",
      ),
    ).toMatch(/check constraint/);
  });

  it("clients cannot feature their own build", async () => {
    expect(await denied(alice, "update public.builds set featured = true where id = $1", [alicePublicBuild])).toMatch(
      /permission denied/,
    );
  });
});

describe("follows and build_follows", () => {
  it("follows: no self-follow, no following on someone's behalf, delete only your own", async () => {
    await as(db, bob, (tx) => tx.query("insert into public.follows (followee_id) values ($1)", [alice]));
    expect(await denied(alice, "insert into public.follows (followee_id) values ($1)", [alice])).toMatch(
      /check constraint/,
    );
    expect(
      await denied(carol, "insert into public.follows (follower_id, followee_id) values ($1, $2)", [bob, carol]),
    ).toMatch(/permission denied/);
    const del = await as(db, carol, (tx) => tx.query("delete from public.follows where follower_id = $1", [bob]));
    expect(del.affectedRows).toBe(0);
    expect(await as(db, carol, (tx) => rows(tx, "select * from public.follows"))).toHaveLength(0);
    expect(await as(db, alice, (tx) => rows(tx, "select * from public.follows"))).toHaveLength(1);
  });

  it("build_follows: only public builds can be followed", async () => {
    await as(db, carol, (tx) =>
      tx.query("insert into public.build_follows (build_id) values ($1)", [alicePublicBuild]),
    );
    const hidden = await as(
      db,
      alice,
      async (tx) =>
        (await one<{ id: string }>(tx, "select id from public.builds where vehicle_id = $1", [aliceVehicle])).id,
    );
    expect(await denied(carol, "insert into public.build_follows (build_id) values ($1)", [hidden])).toMatch(
      /row-level security/,
    );
    expect(await as(db, alice, (tx) => rows(tx, "select user_id from public.build_follows"))).toEqual([
      { user_id: carol },
    ]);
    expect(await as(db, bob, (tx) => rows(tx, "select * from public.build_follows"))).toHaveLength(0);
  });
});

describe("notifications", () => {
  it("are server-written; users read and mark only their own", async () => {
    expect(
      await denied(
        alice,
        "insert into public.notifications (recipient_id, category, entity_type, entity_id, title, body) values ($1, 'new_follower', 'user', 'x', 't', 'b')",
        [alice],
      ),
    ).toMatch(/permission denied/);
    await db.query(
      "insert into public.notifications (recipient_id, category, entity_type, entity_id, title, body) values ($1, 'new_follower', 'user', 'bob_garage', 'New follower', 'Someone followed you')",
      [alice],
    );
    // (alice also has the real "new follower" notification created when bob followed her earlier)
    expect(
      await as(db, alice, (tx) => rows(tx, "select * from public.notifications where body = 'Someone followed you'")),
    ).toHaveLength(1);
    expect(
      await as(db, bob, (tx) => rows(tx, "select * from public.notifications where recipient_id <> $1", [bob])),
    ).toHaveLength(0);
    expect(await denied(alice, "update public.notifications set title = 'hacked'")).toMatch(/permission denied/);
    const r = await as(db, bob, (tx) => tx.query("update public.notifications set read_at = now()"));
    expect(r.affectedRows).toBe(0);
  });
});

describe("rls coverage", () => {
  it("every table in public has RLS enabled", async () => {
    const off = await db.query(
      "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(off.rows).toEqual([]);
  });
});
