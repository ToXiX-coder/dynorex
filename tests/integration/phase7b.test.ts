import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

/** Phase 7 second slice: clubs, posts/comments/likes, feed, group drives, v2 search and moderation. */
const A = "00000000-0000-4000-8000-0000000001a7";
const B = "00000000-0000-4000-8000-0000000001b7";
const C = "00000000-0000-4000-8000-0000000001c7";
const MOD = "00000000-0000-4000-8000-0000000001d7";
const VIN = "1SAMPLEVXN0000077";
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
const svc = async (sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query(sql, params)).rows;
  });

const club = async (uid: string, name = "Sample Street Club") =>
  (await q<{ id: string }>(uid, "select public.create_club($1, 'Weekend drives') as id", [name]))[0]!.id;
const post = async (uid: string, body = "Fresh alignment today", clubId: string | null = null) =>
  (
    await q<{ id: string }>(uid, "insert into public.posts (body, club_id) values ($1, $2) returning id", [
      body,
      clubId,
    ])
  )[0]!.id;
const track = (km: number) =>
  Array.from({ length: Math.round(km * 9) + 1 }, (_, i) => [40 + i * 0.001, -74, 1_700_000_000_000 + i * 10_000]);

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "club_a7"],
    [B, "club_b7"],
    [C, "club_c7"],
    [MOD, "club_mod7"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
  await db.query("insert into app_private.moderators (user_id) values ($1)", [MOD]);
});
afterEach(async () => {
  await db.close();
});

describe("Paddock: clubs", () => {
  it("create, join, leave; names are unique; owners can't leave; counts are public", async () => {
    const id = await club(A);
    expect(await fails(B, "select public.create_club('sample street club', null)")).toMatch(/club_name_taken/);
    await q(B, "select public.join_club($1)", [id]);
    await q(B, "select public.join_club($1)", [id]); // idempotent
    expect(await q(null, "select name, owner_username, members_count from public.public_clubs")).toEqual([
      { name: "Sample Street Club", owner_username: "club_a7", members_count: 2 },
    ]);
    expect(await q(B, "select name, role from public.my_clubs()")).toEqual([
      { name: "Sample Street Club", role: "member" },
    ]);
    // nobody sees anyone else's membership rows
    expect(await q(C, "select * from public.club_members")).toEqual([]);
    expect(await fails(A, "select public.leave_club($1)", [id])).toMatch(/owner_cannot_leave/);
    expect(await q(B, "select public.leave_club($1) as ok", [id])).toEqual([{ ok: true }]);
    // memberships can't be written directly (no self-promotion to owner)
    expect(
      await fails(C, "insert into public.club_members (club_id, user_id, role) values ($1, $2, 'owner')", [id, C]),
    ).toMatch(/permission denied/);
    expect(await fails(B, "update public.clubs set name = 'Taken over' where id = $1", [id])).toMatch(
      /permission denied/,
    );
  });

  it("deleted, hidden or blocked clubs can't be found or joined", async () => {
    const id = await club(A);
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [C]);
    expect(await q(C, "select * from public.public_clubs")).toEqual([]);
    expect(await fails(C, "select public.join_club($1)", [id])).toMatch(/not_found/);
    await q(A, "select public.soft_delete_club($1)", [id]);
    expect(await fails(B, "select public.join_club($1)", [id])).toMatch(/not_found/);
  });
});

describe("Paddock: posts, comments, likes, feed", () => {
  it("club posts need membership; posts can link only your own public build", async () => {
    const id = await club(A);
    expect(await fails(B, "insert into public.posts (body, club_id) values ('hi', $1)", [id])).toMatch(
      /row-level security/,
    );
    await q(B, "select public.join_club($1)", [id]);
    await post(B, "Meet at 9", id);
    const [{ v }] = (await q<{ v: string }>(
      A,
      `insert into public.vehicles (year, make, model, vin, odometer, baseline_hp, baseline_weight_lb)
       values (2004, 'Sample', 'Coupe', $1, 1000, 200, 3000) returning id as v`,
      [VIN],
    )) as [{ v: string }];
    // private build: can't be linked
    expect(await fails(A, "insert into public.posts (body, build_vehicle_id) values ('look', $1)", [v])).toMatch(
      /row-level security/,
    );
    await q(A, "select public.publish_build($1, true)", [v]);
    expect(await fails(B, "insert into public.posts (body, build_vehicle_id) values ('stolen', $1)", [v])).toMatch(
      /row-level security/,
    );
    await q(A, "insert into public.posts (body, build_vehicle_id) values ('look', $1)", [v]);
    const rows = await q<{ body: string; club_name: string | null; build_vehicle_id: string | null }>(
      null,
      "select body, club_name, build_vehicle_id from public.public_posts order by club_name nulls first",
    );
    expect(rows).toEqual([
      { body: "look", club_name: null, build_vehicle_id: v },
      { body: "Meet at 9", club_name: "Sample Street Club", build_vehicle_id: null },
    ]);
    expect(JSON.stringify(await q(null, "select * from public.public_posts"))).not.toMatch(/author_id|vin|VXN/i);
    // the build goes private: the link disappears, the post stays
    await q(A, "select public.publish_build($1, false)", [v]);
    expect(await q(null, "select build_vehicle_id from public.public_posts where body = 'look'")).toEqual([
      { build_vehicle_id: null },
    ]);
  });

  it("comments: text for everyone, Torq stickers for Dynorex+ only; likes once per person", async () => {
    const p = await post(A);
    await q(B, "insert into public.comments (post_id, body) values ($1, 'Clean!')", [p]);
    expect(
      await fails(
        B,
        "insert into public.comments (post_id, sticker) values ($1, (enum_range(null::public.torq_sticker))[1])",
        [p],
      ),
    ).toMatch(/row-level security/);
    await grantPlus(db, B);
    await q(
      B,
      "insert into public.comments (post_id, sticker) values ($1, (enum_range(null::public.torq_sticker))[1])",
      [p],
    );
    expect(await fails(B, "insert into public.comments (post_id) values ($1)", [p])).toMatch(/check constraint/);
    await q(B, "insert into public.post_likes (post_id) values ($1)", [p]);
    await q(C, "insert into public.post_likes (post_id) values ($1)", [p]);
    expect(await fails(B, "insert into public.post_likes (post_id) values ($1)", [p])).toMatch(/duplicate key/);
    expect(await q(null, "select likes_count, comments_count from public.public_posts")).toEqual([
      { likes_count: 2, comments_count: 2 },
    ]);
    // authors delete their own only
    const [{ cid }] = (await q<{ cid: string }>(B, "select id as cid from public.comments where body = 'Clean!'")) as [
      { cid: string },
    ];
    expect(await q(C, "select public.soft_delete_comment($1) as ok", [cid])).toEqual([{ ok: false }]);
    expect(await q(B, "select public.soft_delete_comment($1) as ok", [cid])).toEqual([{ ok: true }]);
    expect(await q(C, "select public.soft_delete_post($1) as ok", [p])).toEqual([{ ok: false }]);
    await q(A, "select public.soft_delete_post($1)", [p]);
    expect(await q(null, "select * from public.public_posts")).toEqual([]);
    expect(await q(null, "select * from public.public_comments")).toEqual([]);
  });

  it("feed: following = you, people you follow, your clubs; muted and blocked people are left out", async () => {
    const id = await club(C);
    await post(A, "from A");
    await post(B, "from B");
    await post(C, "club news", id);
    expect((await q<{ body: string }>(null, "select body from public.paddock_feed('all', 0)")).length).toBe(3);
    expect(await q(null, "select * from public.paddock_feed('following', 0)")).toEqual([]);
    await q(MOD, "insert into public.follows (followee_id) values ($1)", [A]);
    expect(await q(MOD, "select body from public.paddock_feed('following', 0)")).toEqual([{ body: "from A" }]);
    await q(MOD, "select public.join_club($1)", [id]);
    expect(
      (await q<{ body: string }>(MOD, "select body from public.paddock_feed('following', 0)"))
        .map((r) => r.body)
        .sort(),
    ).toEqual(["club news", "from A"]);
    await q(MOD, "insert into public.mutes (muted_id) values ($1)", [A]);
    expect(await q(MOD, "select body from public.paddock_feed('following', 0)")).toEqual([{ body: "club news" }]);
    await q(B, "insert into public.blocks (blocked_id) values ($1)", [MOD]);
    expect(
      (await q<{ body: string }>(MOD, "select body from public.paddock_feed('all', 0)")).map((r) => r.body),
    ).toEqual(["club news"]);
  });

  it("the fast feed returns exactly what the public_posts view shows (hidden, deleted, blocked, club rules)", async () => {
    const c = await club(C);
    const hiddenClub = await club(B, "Hidden Club");
    await post(A, "visible");
    await post(C, "club visible", c);
    await post(B, "in hidden club", hiddenClub);
    const gone = await post(A, "deleted");
    const hidden = await post(B, "hidden");
    const p = await post(A, "liked and commented");
    await q(B, "insert into public.post_likes (post_id) values ($1)", [p]);
    await q(C, "insert into public.comments (post_id, body) values ($1, 'yes')", [p]);
    await q(A, "select public.soft_delete_post($1)", [gone]);
    await db.query("update public.posts set hidden_at = now() where id = $1", [hidden]);
    await db.query("update public.clubs set hidden_at = now() where id = $1", [hiddenClub]);
    await q(MOD, "insert into public.blocks (blocked_id) values ($1)", [C]);
    for (const viewer of [null, MOD, A]) {
      const view = await q(viewer, "select * from public.public_posts order by created_at desc, post_id");
      const feed = await q(viewer, "select * from public.paddock_feed('all', 0)");
      expect(feed, String(viewer)).toEqual(view);
    }
  });

  it("posting and commenting are rate limited and need a verified, named account", async () => {
    const U = "00000000-0000-4000-8000-0000000001e7";
    await createAuthUser(db, U, false);
    await setUsername(db, U, "unverified_e7");
    expect(await fails(U, "insert into public.posts (body) values ('hi')")).toMatch(/row-level security/);
    for (let i = 0; i < 20; i++)
      await db.query("insert into app_private.rate_events (user_id, action) values ($1, 'post')", [A]);
    expect(await fails(A, "insert into public.posts (body) values ('one more')")).toMatch(/rate_limited/);
    expect(await fails(B, "insert into public.posts (body) values ($1)", ["bad\u0007char"])).toMatch(
      /check constraint/,
    );
  });
});

describe("Line + Paddock: group drives", () => {
  const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const drive = (uid: string, routeId: string | null, clubId: string | null = null) =>
    q<{ id: string }>(
      uid,
      `insert into public.events (title, starts_at, ends_at, location_text, kind, route_id, club_id)
       values ('Canyon run', $1, $2, 'Sample lot', 'drive', $3, $4) returning id`,
      [future(48), future(51), routeId, clubId],
    );

  it("a group drive needs a public route; a club event needs the host to be a member", async () => {
    const [{ r }] = (await q<{ r: string }>(
      A,
      "select public.save_route('00000000-0000-4000-8000-00000000f001', 'Canyon', null, $1::jsonb, false) as r",
      [JSON.stringify(track(5))],
    )) as [{ r: string }];
    expect(
      await fails(
        A,
        "insert into public.events (title, starts_at, ends_at, location_text, kind) values ('x', $1, $2, 'y', 'drive')",
        [future(5), future(6)],
      ),
    ).toMatch(/route_required/);
    // a private route can't be attached (that would leak the full track's existence and title)
    expect(
      await fails(
        B,
        "insert into public.events (title, starts_at, ends_at, location_text, kind, route_id) values ('x', $1, $2, 'y', 'drive', $3)",
        [future(5), future(6), r],
      ),
    ).toMatch(/route_not_public/);
    await q(A, "select public.set_route_public($1, true)", [r]);
    const [{ id }] = (await drive(B, r)) as [{ id: string }];
    expect(await q(null, "select kind, route_id from public.public_events where event_id = $1", [id])).toEqual([
      { kind: "drive", route_id: r },
    ]);
    // the route goes private later: the event stays but no longer points at it
    await q(A, "select public.set_route_public($1, false)", [r]);
    expect(await q(null, "select route_id from public.public_events where event_id = $1", [id])).toEqual([
      { route_id: null },
    ]);
    const c = await club(A);
    expect(
      await fails(
        B,
        "insert into public.events (title, starts_at, ends_at, location_text, club_id) values ('x', $1, $2, 'y', $3)",
        [future(5), future(6), c],
      ),
    ).toMatch(/club_member_required/);
  });
});

describe("the fast events list matches the public_events view", () => {
  it("same rows for scheduled future events; cancelled, hidden, blocked and muted ones are left out", async () => {
    const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    const make = async (uid: string, title: string, h: number) =>
      (
        await q<{ id: string }>(
          uid,
          "insert into public.events (title, starts_at, ends_at, location_text) values ($1, $2, $3, 'Lot') returning id",
          [title, at(h), at(h + 2)],
        )
      )[0]!.id;
    await make(A, "later", 50);
    await make(B, "sooner", 5);
    const cancelled = await make(A, "cancelled", 10);
    const hidden = await make(B, "hidden", 20);
    await make(C, "by blocked", 30);
    await make(MOD, "by muted", 40);
    await q(A, "select public.cancel_event($1)", [cancelled]);
    await db.query("update public.events set hidden_at = now() where id = $1", [hidden]);
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [C]);
    await q(A, "insert into public.mutes (muted_id) values ($1)", [MOD]);
    const titles = async (viewer: string | null) =>
      (await q<{ title: string }>(viewer, "select title from public.upcoming_events(0)")).map((r) => r.title);
    expect(await titles(A)).toEqual(["sooner", "later"]);
    expect(await titles(null)).toEqual(["sooner", "by blocked", "by muted", "later"]);
    const view = await q(
      null,
      "select * from public.public_events where status = 'scheduled' and ends_at > now() order by starts_at, event_id",
    );
    expect(await q(null, "select * from public.upcoming_events(0)")).toEqual(view);
  });
});

describe("Line: monthly usage matches the limit", () => {
  it("counts deleted drives, like the limit does; Dynorex+ has no limit", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        (
          await q<{ r: string }>(A, `select public.save_route($1, 'd', null, $2::jsonb, false) as r`, [
            `00000000-0000-4000-8000-00000000e00${i}`,
            JSON.stringify(track(1)),
          ])
        )[0]!.r,
      );
    await q(A, "select public.soft_delete_route($1)", [ids[0]]);
    expect(await q(A, "select * from public.my_route_usage()")).toEqual([{ used: 3, monthly_limit: 5 }]);
    await grantPlus(db, A);
    expect(await q(A, "select * from public.my_route_usage()")).toEqual([{ used: 3, monthly_limit: null }]);
    expect(await fails(null, "select * from public.my_route_usage()")).toMatch(/permission denied/);
  });
});

describe("search covers routes, events and clubs", () => {
  it("finds public items only", async () => {
    await club(A, "Canyon Carvers");
    const [{ r }] = (await q<{ r: string }>(
      A,
      "select public.save_route('00000000-0000-4000-8000-00000000f002', 'Canyon loop', null, $1::jsonb, true) as r",
      [JSON.stringify(track(5))],
    )) as [{ r: string }];
    await q(
      A,
      "select public.save_route('00000000-0000-4000-8000-00000000f003', 'Canyon secret', null, $1::jsonb, false)",
      [JSON.stringify(track(5))],
    );
    await q(
      A,
      "insert into public.events (title, starts_at, ends_at, location_text) values ('Canyon meet', $1, $2, 'Sample lot')",
      [new Date(Date.now() + 86_400_000).toISOString(), new Date(Date.now() + 90_000_000).toISOString()],
    );
    const rows = await q<{ kind: string; label: string; id: string }>(
      B,
      "select kind, label, id from public.search_public('canyon')",
    );
    expect(rows.map((x) => `${x.kind}:${x.label}`).sort()).toEqual([
      "club:Canyon Carvers",
      "event:Canyon meet",
      "route:Canyon loop",
    ]);
    expect(rows.find((x) => x.kind === "route")!.id).toBe(r);
  });
});

describe("moderation covers every v2 surface", () => {
  it("hides and restores routes, events, clubs, posts and comments with an audit row", async () => {
    const c = await club(A);
    const p = await post(A);
    await q(B, "insert into public.comments (post_id, body) values ($1, 'spam spam')", [p]);
    const [{ cm }] = (await q<{ cm: string }>(B, "select id as cm from public.comments")) as [{ cm: string }];
    const hide = (type: string, id: string, action = "hide_content") =>
      svc("select public.apply_moderation($1, $2, $3, $4, null, 'review') as a", [MOD, action, type, id]);
    await hide("comment", cm);
    expect(await q(null, "select * from public.public_comments")).toEqual([]);
    await hide("post", p);
    expect(await q(null, "select * from public.public_posts")).toEqual([]);
    await hide("club", c);
    expect(await q(null, "select * from public.public_clubs")).toEqual([]);
    await hide("club", c, "restore_content");
    expect((await q(null, "select * from public.public_clubs")).length).toBe(1);
    const [{ n }] = (await db.query<{ n: number }>("select count(*)::int as n from public.admin_moderation")).rows as [
      { n: number },
    ];
    expect(n).toBe(4);
    // reports accept the new targets
    for (const t of ["club", "post", "comment"])
      await q(C, "insert into public.reports (target_type, target_id, reason) values ($1, $2, 'spam')", [t, p]);
    // still service-only
    expect(
      await fails(MOD, "select public.apply_moderation($1, 'hide_content', 'post', $2, null, 'x')", [MOD, p]),
    ).toMatch(/permission denied/);
  });
});
