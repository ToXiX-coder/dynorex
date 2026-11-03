import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** Phase 5 exit gate: store-derived entitlements, forged state can't bypass limits, event edge cases. */
const A = "00000000-0000-4000-8000-0000000000a5";
const B = "00000000-0000-4000-8000-0000000000b5";
let db: PGlite;

const q = <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) =>
  as(db, uid, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
const svc = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query<T>(sql, params)).rows;
  });
async function fails(uid: string | null, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await q(uid, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`Expected failure: ${sql}`);
}

const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
let seq = 0;
/** A verified store event as the webhook would apply it. */
async function event(
  user: string,
  type: string,
  o: { eventAt?: string; expires?: string | null; grace?: string | null; id?: string; tx?: string; sync?: string } = {},
) {
  const rows = await svc<{ r: string }>(
    `select public.apply_subscription_event('revenuecat', $1, $2, $3, 'app_store', 'dynorex_plus_monthly', $4,
       $5, $6, $7, $8, $9::public.sub_status) as r`,
    [
      o.id ?? `evt-${++seq}`,
      user,
      type,
      o.tx ?? `tx-${user.slice(-2)}`,
      o.eventAt ?? new Date(Date.now() + seq * 1000).toISOString(),
      at(0),
      o.expires === undefined ? at(30) : o.expires,
      o.grace ?? null,
      o.sync ?? null,
    ],
  );
  return rows[0]!.r;
}
const plus = async (uid: string) =>
  (await q<{ plus: boolean }>(uid, "select plus from public.my_subscription()"))[0]!.plus;
const addVehicle = (uid: string, pub = false) =>
  q<{ id: string }>(
    uid,
    "insert into public.vehicles (year, make, model, baseline_hp, baseline_weight_lb, visibility) values (2004, 'Sample', 'Coupe', 200, 3000, $1) returning id",
    [pub ? "public" : "private"],
  ).then((r) => r[0]!.id);

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "plus_a5"],
    [B, "free_b5"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("subscription state comes only from verified store events", () => {
  it("clients can't read, write or forge subscription state", async () => {
    expect(await fails(A, "select * from public.subscriptions")).toMatch(/permission denied/);
    expect(await fails(A, "select * from public.subscription_events")).toMatch(/permission denied/);
    expect(
      await fails(
        A,
        "insert into public.subscriptions (user_id, platform, product_id, original_transaction_id, status, expires_at, last_event_at) values ($1, 'app_store', 'dynorex_plus_annual', 'forged', 'active', now() + interval '1 year', now())",
        [A],
      ),
    ).toMatch(/permission denied/);
    expect(
      await fails(
        A,
        "select public.apply_subscription_event('revenuecat', 'x', $1, 'INITIAL_PURCHASE', 'app_store', 'dynorex_plus_monthly', 'tx', now(), now(), now() + interval '30 days', null, null)",
        [A],
      ),
    ).toMatch(/permission denied/);
    expect(await fails(A, "select public.user_has_plus($1)", [B])).toMatch(/permission denied/);
    expect(await plus(A)).toBe(false);
    // free limit still holds
    await addVehicle(A);
    await addVehicle(A);
    expect(await fails(A, "insert into public.vehicles (year, make, model) values (2000, 'a', 'b')")).toMatch(
      /plan_limit_vehicles/,
    );
  });

  it("purchase unlocks limits and capabilities; status is readable by the owner only", async () => {
    expect(await event(A, "INITIAL_PURCHASE")).toBe("applied");
    expect(await plus(A)).toBe(true);
    const sub = (await q(A, "select status, product_id, platform, will_renew from public.my_subscription()"))[0];
    expect(sub).toEqual({
      status: "active",
      product_id: "dynorex_plus_monthly",
      platform: "app_store",
      will_renew: true,
    });
    expect(await plus(B)).toBe(false);
    for (let i = 0; i < 3; i++) await addVehicle(A);
    expect(
      await q(A, "select vehicle_limit, route_recordings_per_month, torq_stickers from public.plan_capabilities()"),
    ).toEqual([{ vehicle_limit: null, route_recordings_per_month: null, torq_stickers: true }]);
    expect(
      await q(B, "select vehicle_limit, route_recordings_per_month, torq_stickers from public.plan_capabilities()"),
    ).toEqual([{ vehicle_limit: 2, route_recordings_per_month: 5, torq_stickers: false }]);
  });

  it("duplicate webhooks are no-ops; late (out-of-order) events never roll state back", async () => {
    await event(A, "INITIAL_PURCHASE", { id: "same", eventAt: at(-10) });
    expect(await event(A, "EXPIRATION", { id: "same", eventAt: at(-1) })).toBe("duplicate");
    expect(await plus(A)).toBe(true);
    await event(A, "EXPIRATION", { eventAt: at(-1), expires: at(-1) });
    expect(await plus(A)).toBe(false);
    // a renewal from before the expiration arrives late
    expect(await event(A, "RENEWAL", { eventAt: at(-5), expires: at(25) })).toBe("stale");
    expect(await plus(A)).toBe(false);
    const log = await db.query<{ outcome: string }>("select outcome from public.subscription_events");
    expect(log.rows.map((r) => r.outcome).sort()).toEqual(["applied", "applied", "stale"]);
    // the service role can't touch the log directly, and it's append-only even for the database owner
    await expect(svc("delete from public.subscription_events")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.subscription_events")).rejects.toThrow(/append_only/);
  });

  it("cancellation keeps access until the paid period ends; expiry then re-applies free limits", async () => {
    await event(A, "INITIAL_PURCHASE");
    for (let i = 0; i < 3; i++) await addVehicle(A);
    await event(A, "CANCELLATION", { expires: at(5) });
    expect(await plus(A)).toBe(true);
    expect((await q(A, "select status, will_renew from public.my_subscription()"))[0]).toEqual({
      status: "cancelled",
      will_renew: false,
    });
    await event(A, "EXPIRATION", { expires: at(-0.01) });
    expect(await plus(A)).toBe(false);
    // existing vehicles stay (nothing is deleted), but no new ones over the free limit
    expect(await q(A, "select count(*)::int as n from public.vehicles")).toEqual([{ n: 3 }]);
    expect(await fails(A, "insert into public.vehicles (year, make, model) values (2000, 'a', 'b')")).toMatch(
      /plan_limit_vehicles/,
    );
  });

  it("billing grace keeps access until grace ends; billing retry and refunds remove it at once", async () => {
    await event(A, "INITIAL_PURCHASE");
    await event(A, "BILLING_ISSUE", { expires: at(-0.5), grace: at(6) });
    expect(await plus(A)).toBe(true);
    await event(A, "BILLING_ISSUE", { expires: at(-7), grace: at(-0.1) });
    expect(await plus(A)).toBe(false);
    await event(A, "RENEWAL", { expires: at(30) });
    expect(await plus(A)).toBe(true);
    await event(A, "BILLING_RETRY", { expires: at(30) });
    expect(await plus(A)).toBe(false);
    await event(A, "RENEWAL", { expires: at(30) });
    await event(A, "REFUND", { expires: at(30) });
    expect(await plus(A)).toBe(false);
    await event(A, "RENEWAL", { expires: at(30) });
    await event(A, "REVOKE", { expires: at(30) });
    expect(await plus(A)).toBe(false);
  });

  it("restoring on another account moves the subscription; unknown users and event types are ignored", async () => {
    await event(A, "INITIAL_PURCHASE", { tx: "shared-tx" });
    await event(B, "SYNC", { tx: "shared-tx", sync: "active" });
    expect(await plus(A)).toBe(false);
    expect(await plus(B)).toBe(true);
    expect(await event("00000000-0000-4000-8000-000000000999", "INITIAL_PURCHASE")).toBe("ignored");
    expect(await event(A, "SOMETHING_NEW")).toBe("ignored");
  });

  it("staff/tester overrides still work alongside store state", async () => {
    await db.query("insert into app_private.plan_overrides (user_id, reason) values ($1, 'tester')", [B]);
    expect((await q(B, "select plus, via_override, status from public.my_subscription()"))[0]).toEqual({
      plus: true,
      via_override: true,
      status: null,
    });
  });
});

describe("Plus-only capabilities are enforced by the server", () => {
  it("advanced specs: Plus owners get projections; free users and strangers are refused", async () => {
    await event(A, "INITIAL_PURCHASE");
    const v = await addVehicle(A);
    await q(
      A,
      `insert into public.mods (vehicle_id, name, category, status, spec_deltas) values
        ($1, 'Intake', 'engine', 'complete', '{"schema_version":1,"hp":{"delta":15,"unit":"hp"}}'),
        ($1, 'Turbo', 'engine', 'planned', '{"schema_version":1,"hp":{"delta":100,"unit":"hp"}}'),
        ($1, 'Seats', 'interior', 'complete', '{"schema_version":1,"weight":{"delta":-20,"unit":"lb"}}')`,
      [v],
    );
    const [{ r }] = (await q<{ r: Record<string, unknown> }>(A, "select public.advanced_spec_estimate($1) as r", [
      v,
    ])) as [
      {
        r: { projected: Record<string, number>; by_category: { category: string; hp: number }[]; pending_mods: number };
      },
    ];
    expect(r.projected).toMatchObject({ hp: 315, weight_lb: 2980, lb_per_hp: 9.5 });
    expect(r.by_category.map((c) => c.category)).toEqual(["engine", "interior"]);
    expect(r.pending_mods).toBe(1);
    expect(await fails(B, "select public.advanced_spec_estimate($1)", [v])).toMatch(/plus_required/);
    await db.query("insert into app_private.plan_overrides (user_id, reason) values ($1, 'test')", [B]);
    expect(await fails(B, "select public.advanced_spec_estimate($1)", [v])).toMatch(/not_found/);
  });

  it("stickers: anyone sees counts, only Plus can send, only on public builds, rate limited", async () => {
    await event(A, "INITIAL_PURCHASE");
    const vb = await addVehicle(B, true);
    const build = (await q<{ b: string }>(B, "select public.publish_build($1, true) as b", [vb]))[0]!.b;
    expect(
      await fails(B, "insert into public.build_reactions (build_id, sticker) values ($1, 'fire')", [build]),
    ).toMatch(/row-level security/);
    await q(A, "insert into public.build_reactions (build_id, sticker) values ($1, 'fire')", [build]);
    expect(await q(null, "select sticker, reactions from public.public_build_reactions")).toEqual([
      { sticker: "fire", reactions: 1 },
    ]);
    await q(B, "select public.publish_build($1, false)", [vb]);
    expect(await q(null, "select * from public.public_build_reactions")).toEqual([]);
    expect(
      await fails(A, "insert into public.build_reactions (build_id, sticker) values ($1, 'hype')", [build]),
    ).toMatch(/row-level security/);
    await q(B, "select public.publish_build($1, true)", [vb]);
    for (let i = 0; i < 60; i++)
      await db.query("insert into app_private.rate_events (user_id, action) values ($1, 'reaction')", [A]);
    expect(
      await fails(A, "insert into public.build_reactions (build_id, sticker) values ($1, 'wave')", [build]),
    ).toMatch(/rate_limited/);
  });

  it("build analytics: Plus owners see totals only; views dedupe per day and skip the owner and guests", async () => {
    await event(A, "INITIAL_PURCHASE");
    const v = await addVehicle(A, true);
    await q(A, "select public.publish_build($1, true)", [v]);
    await q(B, "select public.record_build_view($1)", [v]);
    await q(B, "select public.record_build_view($1)", [v]);
    await q(A, "select public.record_build_view($1)", [v]);
    expect(await fails(null, "select public.record_build_view($1)", [v])).toMatch(/permission denied/);
    expect(await q(A, "select views_7d, views_30d, followers from public.my_build_analytics($1)", [v])).toEqual([
      { views_7d: 1, views_30d: 1, followers: 0 },
    ]);
    expect(await fails(B, "select * from public.my_build_analytics($1)", [v])).toMatch(/plus_required/);
    expect(await fails(A, "select * from app_private.build_views")).toMatch(/permission denied/);
  });

  it("the profile badge is computed by the server", async () => {
    await event(A, "INITIAL_PURCHASE");
    expect(await q(null, "select username, plus_member from public.public_profiles order by username")).toEqual([
      { username: "free_b5", plus_member: false },
      { username: "plus_a5", plus_member: true },
    ]);
  });
});

describe("subscription notifications", () => {
  it("expiring (3 days out, not renewing) and expired are each sent once, respecting prefs", async () => {
    await event(A, "INITIAL_PURCHASE");
    await event(A, "CANCELLATION", { expires: at(2.5) });
    await event(B, "INITIAL_PURCHASE");
    await event(B, "EXPIRATION", { expires: at(-1) });
    expect(await svc("select public.queue_subscription_notifications() as n")).toEqual([{ n: 2 }]);
    expect(await svc("select public.queue_subscription_notifications() as n")).toEqual([{ n: 0 }]);
    expect(await q(A, "select category, entity_type, entity_id from public.notifications")).toEqual([
      { category: "subscription_expiring", entity_type: "subscription", entity_id: "plus" },
    ]);
    expect(await q(B, "select title from public.notifications")).toEqual([{ title: "Your Dynorex+ expired" }]);
    expect(await fails(A, "select public.queue_subscription_notifications()")).toMatch(/permission denied/);
  });
});
