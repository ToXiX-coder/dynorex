import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

/** Phase 4 exit gate: visibility matrix, no leaks, follows/blocks, nearby, notifications, search. */
const A = "00000000-0000-4000-8000-0000000000a4"; // owner
const B = "00000000-0000-4000-8000-0000000000b4"; // follower
const C = "00000000-0000-4000-8000-0000000000c4"; // stranger
const U = "00000000-0000-4000-8000-0000000000d4"; // unverified
const MOD = "00000000-0000-4000-8000-0000000000e4"; // moderator
const VIN = "1SAMPLEVXN0000042";
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

async function vehicle(uid: string, opts: { pub?: boolean; make?: string; model?: string } = {}) {
  const [row] = await q<{ id: string }>(
    uid,
    `insert into public.vehicles (year, make, model, vin, odometer, baseline_hp, baseline_weight_lb, nickname)
     values (2004, $1, $2, $3, 81234, 200, 3000, 'Secret garage name') returning id`,
    [opts.make ?? "Sample", opts.model ?? "Coupe", VIN],
  );
  const id = row!.id;
  const build = (await q<{ b: string }>(uid, "select public.publish_build($1, $2) as b", [id, opts.pub ?? false]))[0]!
    .b;
  return { id, build };
}

async function mod(uid: string, vehicleId: string, name = "Sample intake", status = "complete") {
  return (
    await q<{ id: string }>(
      uid,
      `insert into public.mods (vehicle_id, name, category, brand, part_number, cost_minor, currency, status, notes, spec_deltas)
       values ($1, $2, 'engine', 'SampleBrand', 'SB-100', 99999, 'USD', $3, 'private note about my garage code 4411',
               '{"schema_version":1,"hp":{"delta":20,"unit":"hp"}}') returning id`,
      [vehicleId, name, status],
    )
  )[0]!.id;
}

const notes = (uid: string) =>
  q<{ category: string; title: string; body: string; entity_type: string; entity_id: string }>(
    uid,
    "select category, title, body, entity_type, entity_id from public.notifications order by created_at",
  );

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "owner_a4"],
    [B, "follower_b4"],
    [C, "stranger_c4"],
    [MOD, "mod_e4"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
    await grantPlus(db, id);
  }
  await createAuthUser(db, U, false);
  await setUsername(db, U, "unverified_d4");
});
afterEach(async () => {
  await db.close();
});

describe("publishing and the visibility matrix", () => {
  it("public is visible to guests, signed-in users, share links, specs and status; private is not_found everywhere", async () => {
    const pub = await vehicle(A, { pub: true });
    const priv = await vehicle(A, { pub: false });
    await mod(A, pub.id);
    await mod(A, priv.id);

    for (const viewer of [null, B]) {
      expect(await q(viewer, "select vehicle_id from public.public_builds")).toEqual([{ vehicle_id: pub.id }]);
      expect(await q(viewer, "select public.public_build_status($1) as s", [pub.id])).toEqual([{ s: "public" }]);
      expect(await q(viewer, "select public.public_build_status($1) as s", [priv.id])).toEqual([{ s: "not_found" }]);
      expect(await q(viewer, "select * from public.public_build_specs($1)", [priv.id])).toEqual([]);
      expect(await q(viewer, "select * from public.public_mods where vehicle_id = $1", [priv.id])).toEqual([]);
      expect(await fails(viewer, "select public.share_build_link($1)", [priv.id])).toMatch(/not_shareable/);
    }
    expect(await q(B, "select public.share_build_link($1) as p", [pub.id])).toEqual([{ p: `/build/${pub.id}` }]);
    const specs = await q<{ hp: string; hp_status: string; completed_mods_counted: number }>(
      null,
      "select hp, hp_status, completed_mods_counted from public.public_build_specs($1)",
      [pub.id],
    );
    expect(specs).toEqual([{ hp: "220", hp_status: "estimate", completed_mods_counted: 1 }]);
    // a never-existing id looks exactly like a private one
    expect(await q(null, "select public.public_build_status('00000000-0000-4000-8000-000000000999') as s")).toEqual([
      { s: "not_found" },
    ]);
  });

  it("deleted public build says 'gone'; deleted private build still says not_found", async () => {
    const pub = await vehicle(A, { pub: true });
    const priv = await vehicle(A);
    await q(A, "select public.soft_delete_vehicle($1)", [pub.id]);
    await q(A, "select public.soft_delete_vehicle($1)", [priv.id]);
    expect(await q(null, "select public.public_build_status($1) as s", [pub.id])).toEqual([{ s: "gone" }]);
    expect(await q(null, "select public.public_build_status($1) as s", [priv.id])).toEqual([{ s: "not_found" }]);
  });

  it("going private hides the build at once (views, specs, mods, photos, feed, search) and re-checks shares", async () => {
    const v = await vehicle(A, { pub: true });
    await mod(A, v.id);
    await q(B, "insert into public.build_follows (build_id) values ($1)", [v.build]);
    expect(await q(B, "select mod_id from public.home_feed(0)")).toHaveLength(1);
    await q(A, "update public.vehicles set visibility = 'private' where id = $1", [v.id]);
    expect(await q(null, "select 1 from public.public_builds")).toEqual([]);
    expect(await q(B, "select mod_id from public.home_feed(0)")).toEqual([]);
    expect(await q(B, "select * from public.search_public('sample')")).toEqual([]);
    expect(await fails(B, "select public.share_build_link($1)", [v.id])).toMatch(/not_shareable/);
    expect(await q(A, "select visibility from public.builds where id = $1", [v.build])).toEqual([
      { visibility: "private" },
    ]);
  });

  it("only a verified owner with a username can publish, and nobody can publish someone else's vehicle", async () => {
    await grantPlus(db, U);
    const [{ id }] = (await q<{ id: string }>(
      U,
      "insert into public.vehicles (year, make, model) values (2001, 'a', 'b') returning id",
    )) as [{ id: string }];
    expect(await fails(U, "select public.publish_build($1, true)", [id])).toMatch(/email_not_verified/);
    const v = await vehicle(A);
    expect(await fails(B, "select public.publish_build($1, true)", [v.id])).toMatch(/not_found/);
    expect(await q(A, "select visibility from public.vehicles where id = $1", [v.id])).toEqual([
      { visibility: "private" },
    ]);
  });
});

describe("no private fields leak", () => {
  it("public views and functions never carry VIN, odometer, costs, notes, owner-only data or storage paths", async () => {
    const v = await vehicle(A, { pub: true });
    const m = await mod(A, v.id);
    await db.query(
      "insert into public.mod_photos (owner_id, mod_id, storage_path, mime, bytes) values ($1, $2, $3, 'image/jpeg', 100)",
      [A, m, `${A}/11111111-1111-4111-8111-111111111111.jpg`],
    );
    await q(B, "insert into public.build_follows (build_id) values ($1)", [v.build]);
    const outputs = [
      await q(null, "select * from public.public_profiles"),
      await q(null, "select * from public.public_vehicles"),
      await q(null, "select * from public.public_builds"),
      await q(null, "select * from public.public_mods"),
      await q(null, "select * from public.public_mod_photos"),
      await q(null, "select * from public.public_build_specs($1)", [v.id]),
      await q(null, "select * from public.discover_builds('trending', 0)"),
      await q(B, "select * from public.home_feed(0)"),
      await q(B, "select * from public.search_public('sample')"),
      await q(B, "select * from public.search_public('sb 100')"),
      await notes(A),
      await notes(B),
    ];
    const json = JSON.stringify(outputs);
    for (const secret of [VIN, "81234", "99999", "garage code 4411", "storage_path", "hero_path", "@example.test"]) {
      expect(json, secret).not.toContain(secret);
    }
    for (const key of ["vin", "odometer", "cost_minor", "notes", "owner_id", "latitude", "cell_lat"]) {
      expect(json, key).not.toContain(`"${key}"`);
    }
    expect(await q(null, "select photo_id from public.public_mod_photos")).toHaveLength(1);
  });

  it("guests can't reach search, the feed, regions, push tokens or notification prefs", async () => {
    expect(await fails(null, "select * from public.search_public('sample')")).toMatch(/permission denied/);
    expect(await fails(null, "select * from public.home_feed(0)")).toMatch(/permission denied/);
    expect(await fails(null, "select public.set_my_region(1, 1, true)")).toMatch(/permission denied/);
    expect(await fails(null, "select public.register_push_token('ExponentPushToken[abcdefghijkl]', 'ios')")).toMatch(
      /permission denied/,
    );
    expect(await fails(B, "select * from app_private.push_tokens")).toMatch(/permission denied/);
    expect(await fails(B, "select * from app_private.user_regions")).toMatch(/permission denied/);
    expect(await fails(B, "select * from public.claim_pending_pushes(10)")).toMatch(/permission denied/);
  });
});

describe("follows, blocks and privacy", () => {
  it("you can follow a public build, not a private one and not your own", async () => {
    const pub = await vehicle(A, { pub: true });
    const priv = await vehicle(A);
    await q(B, "insert into public.build_follows (build_id) values ($1)", [pub.build]);
    expect(await fails(B, "insert into public.build_follows (build_id) values ($1)", [priv.build])).toMatch(
      /row-level security/,
    );
    expect(await fails(A, "insert into public.build_follows (build_id) values ($1)", [pub.build])).toMatch(
      /row-level security/,
    );
    expect(await q(null, "select followers_count from public.public_builds")).toEqual([{ followers_count: 1 }]);
  });

  it("blocking removes follows both ways, hides each other everywhere and stops notifications", async () => {
    const v = await vehicle(A, { pub: true });
    await q(B, "insert into public.build_follows (build_id) values ($1)", [v.build]);
    await q(B, "insert into public.follows (followee_id) values ($1)", [A]);
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);
    expect(await q(B, "select * from public.build_follows")).toEqual([]);
    expect(await q(B, "select 1 from public.public_builds")).toEqual([]);
    expect(await q(B, "select * from public.discover_builds('new', 0)")).toEqual([]);
    expect(await q(B, "select * from public.search_public('owner')")).toEqual([]);
    expect(await q(B, "select public.public_build_status($1) as s", [v.id])).toEqual([{ s: "not_found" }]);
    expect(await fails(B, "insert into public.build_follows (build_id) values ($1)", [v.build])).toMatch(
      /row-level security/,
    );
    // A's earlier "new follower" from B disappears from A's inbox
    expect((await notes(A)).filter((n) => n.category === "new_follower")).toEqual([]);
    await mod(A, v.id);
    expect(await notes(B)).toEqual([]);
  });

  it("muting hides an owner from Discover, search and the feed without changing access", async () => {
    const v = await vehicle(A, { pub: true });
    await mod(A, v.id);
    await q(B, "insert into public.build_follows (build_id) values ($1)", [v.build]);
    await q(B, "insert into public.mutes (muted_id) values ($1)", [A]);
    expect(await q(B, "select * from public.discover_builds('trending', 0)")).toEqual([]);
    expect(await q(B, "select * from public.home_feed(0)")).toEqual([]);
    expect(await q(B, "select * from public.search_public('sample')")).toEqual([]);
    expect(await q(B, "select 1 from public.public_builds")).toHaveLength(1);
  });

  it("build follows are rate limited (shared 100/hour follow budget)", async () => {
    const v = await vehicle(A, { pub: true });
    for (let i = 0; i < 100; i++)
      await db.query("insert into app_private.rate_events (user_id, action) values ($1, 'follow')", [B]);
    expect(await fails(B, "insert into public.build_follows (build_id) values ($1)", [v.build])).toMatch(
      /rate_limited/,
    );
  });
});

describe("notifications", () => {
  it("new follower and build update payloads hold only public facts, link to the right entity, and batch hourly", async () => {
    const v = await vehicle(A, { pub: true });
    await q(B, "insert into public.follows (followee_id) values ($1)", [A]);
    await q(B, "insert into public.build_follows (build_id) values ($1)", [v.build]);
    await mod(A, v.id, "First mod");
    await mod(A, v.id, "Second mod");
    expect(await notes(A)).toEqual([
      {
        category: "new_follower",
        title: "New follower",
        body: "@follower_b4 started following you.",
        entity_type: "user",
        entity_id: "follower_b4",
      },
    ]);
    const forB = await notes(B);
    expect(forB).toEqual([
      {
        category: "build_update",
        title: "Build update",
        body: "@owner_a4 added a mod to Secret garage name.",
        entity_type: "build",
        entity_id: v.id,
      },
    ]);
    expect(JSON.stringify(forB)).not.toMatch(/First mod|Second mod|99999|4411|SB-100/);
  });

  it("private builds never notify, and a disabled category sends nothing", async () => {
    const v = await vehicle(A, { pub: true });
    await q(B, "insert into public.build_follows (build_id) values ($1)", [v.build]);
    await q(A, "select public.publish_build($1, false)", [v.id]);
    await mod(A, v.id);
    expect(await notes(B)).toEqual([]);
    await q(A, "select public.set_notification_pref('new_follower', false)");
    await q(C, "insert into public.follows (followee_id) values ($1)", [A]);
    expect(await notes(A)).toEqual([]);
    expect(await q(A, "select category, enabled from public.notification_prefs")).toEqual([
      { category: "new_follower", enabled: false },
    ]);
    expect(
      await fails(A, "insert into public.notification_prefs (category, enabled) values ('build_update', false)"),
    ).toMatch(/permission denied/);
  });

  it("unfollow/refollow doesn't spam; mark-all-read only touches your own", async () => {
    await q(B, "insert into public.follows (followee_id) values ($1)", [A]);
    await q(B, "delete from public.follows where followee_id = $1", [A]);
    await q(B, "insert into public.follows (followee_id) values ($1)", [A]);
    expect(await notes(A)).toHaveLength(1);
    await q(C, "insert into public.follows (followee_id) values ($1)", [B]);
    expect(await q(A, "select public.mark_all_notifications_read() as n")).toEqual([{ n: 1 }]);
    expect(await q(B, "select count(*)::int as n from public.notifications where read_at is null")).toEqual([{ n: 1 }]);
  });

  it("push tokens: validated, moved between accounts, claimed once by the dispatcher", async () => {
    const token = "ExponentPushToken[abcdefghijklmnop]";
    expect(await fails(B, "select public.register_push_token('not-a-token', 'ios')")).toMatch(/check constraint/);
    await q(B, "select public.register_push_token($1, 'ios')", [token]);
    await q(C, "select public.register_push_token($1, 'android')", [token]);
    expect(await q(B, "select devices from public.my_push_status()")).toEqual([{ devices: 0 }]);
    expect(await q(C, "select devices from public.my_push_status()")).toEqual([{ devices: 1 }]);
    await q(B, "insert into public.follows (followee_id) values ($1)", [C]);
    const claim = async () =>
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        return (await tx.query("select * from public.claim_pending_pushes(10)")).rows;
      });
    const first = await claim();
    expect(first).toEqual([
      {
        notification_id: expect.any(String),
        token,
        title: "New follower",
        body: "@follower_b4 started following you.",
        category: "new_follower",
        entity_type: "user",
        entity_id: "follower_b4",
      },
    ]);
    expect(await claim()).toEqual([]);
  });
});

describe("discover, nearby and search", () => {
  it("discover modes rank on the server and reject unknown modes", async () => {
    const quiet = await vehicle(A, { pub: true, make: "Quiet" });
    const busy = await vehicle(C, { pub: true, make: "Busy" });
    await q(B, "insert into public.build_follows (build_id) values ($1)", [busy.build]);
    await q(A, "insert into public.build_follows (build_id) values ($1)", [busy.build]);
    await mod(A, quiet.id);
    const trending = await q<{ make: string }>(B, "select make from public.discover_builds('trending', 0)");
    expect(trending.map((r) => r.make)).toEqual(["Busy", "Quiet"]);
    const newest = await q<{ make: string }>(null, "select make from public.discover_builds('new', 0)");
    expect(newest.map((r) => r.make)).toEqual(["Quiet", "Busy"]);
    // your own builds are left out
    expect(
      (await q<{ make: string }>(A, "select make from public.discover_builds('new', 0)")).map((r) => r.make),
    ).toEqual(["Busy"]);
    expect(await fails(B, "select * from public.discover_builds('owner_id desc', 0)")).toMatch(/invalid_mode/);
  });

  it("nearby needs opt-in on both sides, 3+ owners, returns no location, and region changes are limited", async () => {
    const extra = ["00000000-0000-4000-8000-0000000000f4", "00000000-0000-4000-8000-0000000000f5"];
    for (const [i, id] of extra.entries()) {
      await createAuthUser(db, id, true);
      await setUsername(db, id, `near_${i}`);
    }
    await vehicle(A, { pub: true });
    await vehicle(C, { pub: true });
    await vehicle(extra[0]!, { pub: true });
    await q(B, "select public.set_my_region(80, -147, false)");
    await q(A, "select public.set_my_region(80, -146, true)");
    await q(C, "select public.set_my_region(81, -147, true)");
    expect(await q(B, "select * from public.nearby_builds(0)")).toEqual([]); // only 2 owners
    await q(extra[0]!, "select public.set_my_region(79, -148, true)");
    const near = await q(B, "select * from public.nearby_builds(0)");
    expect(near).toHaveLength(3);
    expect(JSON.stringify(near)).not.toMatch(/cell|lat|lon|distance/);
    // someone far away (or not sharing) is never included
    await q(extra[1]!, "select public.set_my_region(10, 10, true)");
    expect(await q(B, "select * from public.nearby_builds(0)")).toHaveLength(3);
    expect(await q(B, "select enabled, share_builds from public.my_region()")).toEqual([
      { enabled: true, share_builds: false },
    ]);
    expect(await fails(B, "select public.set_my_region(999, 0, true)")).toMatch(/check constraint/);
    for (let i = 0; i < 10; i++)
      await db.query("insert into app_private.rate_events (user_id, action) values ($1, 'region')", [C]);
    expect(await fails(C, "select public.set_my_region(1, 1, true)")).toMatch(/rate_limited/);
    await q(B, "select public.clear_my_region()");
    expect(await q(B, "select * from public.nearby_builds(0)")).toEqual([]);
  });

  it("search finds builds, users and mods by prefix; exact first; operators are inert; 60 a minute", async () => {
    await vehicle(A, { pub: true, make: "Subaru", model: "WRX" });
    const v2 = await vehicle(C, { pub: true, make: "Subaruish", model: "Other" });
    await mod(C, v2.id, "Turbo kit");
    const res = await q<{ kind: string; label: string; sublabel: string; exact: boolean }>(
      B,
      "select kind, label, sublabel, exact from public.search_public('subaru')",
    );
    expect(res.filter((r) => r.kind === "build").map((r) => [r.sublabel, r.exact])).toEqual([
      ["2004 Subaru WRX · @owner_a4", true],
      ["2004 Subaruish Other · @stranger_c4", false],
    ]);
    expect(
      await q<{ kind: string; label: string }>(B, "select kind, label from public.search_public('owner_')"),
    ).toEqual([
      { kind: "build", label: "Secret garage name" },
      { kind: "user", label: "@owner_a4" },
    ]);
    expect(await q<{ label: string }>(B, "select label from public.search_public('turb')")).toEqual([
      { label: "Turbo kit" },
    ]);
    expect(await q<{ label: string }>(B, "select label from public.search_public('SB-100')")).toHaveLength(1);
    // tsquery syntax is stripped, not interpreted
    expect(await q(B, "select * from public.search_public($1)", ["!(sub | x) & ' :*"])).toBeDefined();
    expect(await q(B, "select * from public.search_public('a')")).toEqual([]);
    for (let i = 0; i < 60; i++)
      await db.query("insert into app_private.rate_events (user_id, action) values ($1, 'search')", [B]);
    expect(await fails(B, "select * from public.search_public('subaru')")).toMatch(/rate_limited/);
  });
});

describe("moderation hand-off and Build of the Week", () => {
  it("moderators hide/restore content with an audit row; non-moderators and clients can't", async () => {
    const v = await vehicle(A, { pub: true });
    const [{ id: report }] = (await q<{ id: string }>(
      B,
      "insert into public.reports (target_type, target_id, reason) values ('build', $1, 'spam') returning id",
      [v.build],
    )) as [{ id: string }];
    const svc = (sql: string, params: unknown[]) =>
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        return (await tx.query(sql, params)).rows;
      });
    expect(
      await fails(A, "select public.apply_moderation($1, 'restore_content', 'build', $2, null, 'x')", [A, v.build]),
    ).toMatch(/permission denied/);
    await expect(
      svc("select public.apply_moderation($1, 'hide_content', 'build', $2, $3, 'spam')", [B, v.build, report]),
    ).rejects.toThrow(/not_a_moderator/);
    await db.query("insert into app_private.moderators (user_id) values ($1)", [MOD]);
    await svc("select public.apply_moderation($1, 'hide_content', 'build', $2, $3, 'Spam build')", [
      MOD,
      v.build,
      report,
    ]);
    expect(await q(null, "select 1 from public.public_builds")).toEqual([]);
    expect(await q(null, "select public.public_build_status($1) as s", [v.id])).toEqual([{ s: "not_found" }]);
    expect(await q(B, "select status from public.reports")).toEqual([{ status: "actioned" }]);
    // the owner can't un-hide it
    expect(await fails(A, "update public.vehicles set hidden_at = null where id = $1", [v.id])).toMatch(
      /permission denied/,
    );
    await svc("select public.apply_moderation($1, 'restore_content', 'vehicle', $2, null, 'Reviewed')", [MOD, v.id]);
    expect(await q(null, "select 1 from public.public_builds")).toHaveLength(1);
    const audit = await db.query<{ action: string; prior_state: unknown; result_state: unknown }>(
      "select action, prior_state, result_state from public.admin_moderation order by created_at",
    );
    expect(audit.rows.map((r) => r.action)).toEqual(["hide_content", "restore_content"]);
    expect(audit.rows[0]!.result_state).toEqual({ hidden: true });
  });

  it("Build of the Week is off: selection refuses, the public view is empty, clients can't write", async () => {
    const v = await vehicle(A, { pub: true });
    await db.query("insert into app_private.moderators (user_id) values ($1)", [MOD]);
    const svc = (sql: string, params: unknown[]) =>
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        return (await tx.query(sql, params)).rows;
      });
    await expect(
      svc("select public.select_build_of_the_week('2026-10-05', $1, $2, 'Great build')", [v.build, MOD]),
    ).rejects.toThrow(/botw_disabled/);
    expect(
      await fails(
        B,
        "insert into public.build_of_the_week (week_start, build_id, selected_by, reason) values ('2026-10-05', $1, $2, 'me')",
        [v.build, B],
      ),
    ).toMatch(/permission denied/);
    expect(await q(null, "select * from public.public_build_of_the_week")).toEqual([]);
    // when an operator turns it on, the boundary still checks the build is public
    await db.query("update app_private.feature_settings set enabled = true where key = 'build_of_the_week'");
    await svc("select public.select_build_of_the_week('2026-10-05', $1, $2, 'Great build')", [v.build, MOD]);
    expect(await q(null, "select title from public.public_build_of_the_week")).toEqual([
      { title: "Secret garage name" },
    ]);
  });
});
