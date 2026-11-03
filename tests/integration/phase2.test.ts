import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

const A = "00000000-0000-4000-8000-0000000000a1"; // verified, named
const B = "00000000-0000-4000-8000-0000000000b1"; // verified, named
const N = "00000000-0000-4000-8000-0000000000c1"; // verified, no username yet
const U = "00000000-0000-4000-8000-0000000000d1"; // unverified, named
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

afterEach(async () => {
  await db.close();
});

beforeEach(async () => {
  db = await freshDb();
  for (const [id, verified] of [
    [A, true],
    [B, true],
    [N, true],
    [U, false],
  ] as const)
    await createAuthUser(db, id, verified);
  await setUsername(db, A, "sample_a");
  await setUsername(db, B, "sample_b");
  await setUsername(db, U, "sample_u");
});

describe("profiles created at sign-up", () => {
  it("the trigger creates a profile with no username, hidden from public views", async () => {
    expect(await q(N, "select username, onboarding_step from public.users")).toEqual([
      { username: null, onboarding_step: 0 },
    ]);
    const pub = await q<{ username: string }>(null, "select username from public.public_profiles order by username");
    expect(pub.map((r) => r.username)).toEqual(["sample_a", "sample_b", "sample_u"]);
  });

  it("username_available checks format, reserved names and taken names", async () => {
    const check = async (name: string) =>
      (await q<{ ok: boolean }>(N, "select public.username_available($1) as ok", [name]))[0]!.ok;
    expect(await check("fresh_name")).toBe(true);
    expect(await check("sample_a")).toBe(false);
    expect(await check("admin")).toBe(false);
    expect(await check("Bad Name")).toBe(false);
    expect(await check("ab")).toBe(false);
    expect(await fails(null, "select public.username_available('x')")).toMatch(/permission denied/);
  });

  it("profile text rejects control characters", async () => {
    expect(await fails(A, "update public.users set bio = $1 where id = $2", ["hi\u0007there", A])).toMatch(
      /check constraint/,
    );
  });

  it("publishing and following need a username", async () => {
    expect(
      await fails(N, "insert into public.vehicles (year, make, model, visibility) values (2001, 'a', 'b', 'public')"),
    ).toMatch(/username_required/);
    expect(await fails(N, "insert into public.follows (followee_id) values ($1)", [A])).toMatch(/row-level security/);
    await setUsername(db, N, "sample_n");
    await q(N, "insert into public.follows (followee_id) values ($1)", [A]);
  });
});

describe("blocks", () => {
  async function publicBuildOf(uid: string) {
    return q<{ id: string }>(
      uid,
      `with v as (insert into public.vehicles (year, make, model, visibility) values (2000, 'Sample', 'Car', 'public') returning id)
       insert into public.builds (vehicle_id, title, visibility) select id, 'Build', 'public' from v returning id`,
    ).then((r) => r[0]!.id);
  }

  it("removes follows both ways, hides each other's public content, and is invisible to the blocked user", async () => {
    const buildA = await publicBuildOf(A);
    const buildB = await publicBuildOf(B);
    await q(A, "insert into public.follows (followee_id) values ($1)", [B]);
    await q(B, "insert into public.follows (followee_id) values ($1)", [A]);
    await q(B, "insert into public.build_follows (build_id) values ($1)", [buildA]);
    await q(A, "insert into public.build_follows (build_id) values ($1)", [buildB]);

    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);

    expect(await q(A, "select * from public.follows")).toEqual([]);
    expect(await q(A, "select * from public.build_follows")).toEqual([]);
    // B can't see A's profile or build, and A can't see B's
    expect(await q(B, "select * from public.public_profiles where user_id = $1", [A])).toEqual([]);
    expect(await q(B, "select * from public.public_builds where build_id = $1", [buildA])).toEqual([]);
    expect(await q(A, "select * from public.public_builds where build_id = $1", [buildB])).toEqual([]);
    // a third party still sees both
    expect(await q(null, "select build_id from public.public_builds")).toHaveLength(2);
    // B can't follow A again, through either table
    expect(await fails(B, "insert into public.follows (followee_id) values ($1)", [A])).toMatch(/row-level security/);
    expect(await fails(B, "insert into public.build_follows (build_id) values ($1)", [buildA])).toMatch(
      /row-level security/,
    );
    // B never learns who blocked them
    expect(await q(B, "select * from public.blocks")).toEqual([]);
    expect(await q(A, "select blocked_id from public.blocks")).toEqual([{ blocked_id: B }]);
    // unblock restores visibility (follows are not restored)
    await q(A, "delete from public.blocks where blocked_id = $1", [B]);
    expect(await q(B, "select user_id from public.public_profiles where user_id = $1", [A])).toHaveLength(1);
  });

  it("can't block yourself or act on someone else's behalf", async () => {
    expect(await fails(A, "insert into public.blocks (blocked_id) values ($1)", [A])).toMatch(/check constraint/);
    expect(await fails(A, "insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [B, U])).toMatch(
      /permission denied/,
    );
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [B]);
    const del = await as(db, B, (tx) => tx.query("delete from public.blocks"));
    expect(del.affectedRows).toBe(0);
  });
});

describe("mutes", () => {
  it("are private to the muter and change no access", async () => {
    await q(A, "insert into public.mutes (muted_id) values ($1)", [B]);
    expect(await q(B, "select * from public.mutes")).toEqual([]);
    expect(await q(A, "select muted_id from public.mutes")).toEqual([{ muted_id: B }]);
    expect(await q(A, "select user_id from public.public_profiles where user_id = $1", [B])).toHaveLength(1);
  });
});

describe("reports", () => {
  it("need a verified email; reporters see only their own reports' status", async () => {
    expect(
      await fails(U, "insert into public.reports (target_type, target_id, reason) values ('user', $1, 'spam')", [A]),
    ).toMatch(/row-level security/);
    await q(
      A,
      "insert into public.reports (target_type, target_id, reason, details) values ('user', $1, 'spam', 'sample details')",
      [B],
    );
    expect(await q(A, "select target_type, reason, status from public.reports")).toEqual([
      { target_type: "user", reason: "spam", status: "open" },
    ]);
    expect(await fails(A, "select details from public.reports")).toMatch(/permission denied/);
    expect(await fails(A, "select reporter_id from public.reports")).toMatch(/permission denied/);
    // the reported person sees nothing
    expect(await q(B, "select id from public.reports")).toEqual([]);
    expect(await fails(A, "update public.reports set status = 'dismissed'")).toMatch(/permission denied/);
  });

  it("are rate limited to 10 per hour", async () => {
    for (let i = 0; i < 10; i++) {
      await q(A, "insert into public.reports (target_type, target_id, reason) values ('user', $1, 'spam')", [B]);
    }
    expect(
      await fails(A, "insert into public.reports (target_type, target_id, reason) values ('user', $1, 'spam')", [B]),
    ).toMatch(/rate_limited/);
  });
});

describe("rate limits", () => {
  it("cap vehicle adds at 10 per hour per user, without touching other users or trusted server code", async () => {
    await grantPlus(db, A); // free plan stops at 2 vehicles first; the hourly limit applies to Dynorex+ too
    for (let i = 0; i < 10; i++) await q(A, "insert into public.vehicles (year, make, model) values (2000, 'a', 'b')");
    expect(await fails(A, "insert into public.vehicles (year, make, model) values (2000, 'a', 'b')")).toMatch(
      /rate_limited/,
    );
    await q(B, "insert into public.vehicles (year, make, model) values (2000, 'a', 'b')");
    // no end user (seed / service role): not limited
    await db.query("insert into public.vehicles (owner_id, year, make, model) values ($1, 2000, 'a', 'b')", [A]);
  });

  it("keeps its counters private", async () => {
    expect(await fails(A, "select * from app_private.rate_events")).toMatch(/permission denied/);
    expect(await fails(A, "select public.enforce_rate_limit('x', 1, 1)")).toMatch(/permission denied/);
  });
});

describe("moderation audit", () => {
  it("is invisible to clients and append-only for everyone", async () => {
    expect(await fails(A, "select * from public.admin_moderation")).toMatch(/permission denied/);
    expect(
      await fails(
        A,
        "insert into public.admin_moderation (moderator_id, action, target_type, target_id, reason) values ($1, 'warn_user', 'user', $2, 'x')",
        [A, B],
      ),
    ).toMatch(/permission denied/);
    await db.query(
      "insert into public.admin_moderation (moderator_id, action, target_type, target_id, reason) values ($1, 'warn_user', 'user', $2, 'sample reason')",
      [A, B],
    );
    await expect(db.query("update public.admin_moderation set reason = 'edited'")).rejects.toThrow(/append_only/);
    await expect(db.query("delete from public.admin_moderation")).rejects.toThrow(/append_only/);
  });
});

describe("account deletion", () => {
  it("deleting the auth user removes their data but keeps reports they filed (anonymised)", async () => {
    await q(A, "insert into public.vehicles (year, make, model) values (2000, 'a', 'b')");
    await q(A, "insert into public.follows (followee_id) values ($1)", [B]);
    await q(A, "insert into public.reports (target_type, target_id, reason) values ('user', $1, 'spam')", [B]);
    await db.query("delete from auth.users where id = $1", [A]); // what the delete-account Edge Function does
    const left = await db.query<{ n: number }>(
      "select (select count(*) from public.users where id = $1) + (select count(*) from public.vehicles where owner_id = $1) + (select count(*) from public.follows where follower_id = $1) as n",
      [A],
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
    const reports = await db.query<{ reporter_id: string | null }>("select reporter_id from public.reports");
    expect(reports.rows).toEqual([{ reporter_id: null }]);
  });
});
