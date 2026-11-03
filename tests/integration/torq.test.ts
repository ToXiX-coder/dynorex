import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** Torq chat: community mod data (public only, privacy thresholds, ranges) and the chat rate limit. */
let db: PGlite;
const uid = (n: number) => `00000000-0000-4000-8000-0000000007${n.toString(16).padStart(2, "0")}`;
const q = <T = Record<string, unknown>>(u: string | null, sql: string, params: unknown[] = []) =>
  as(db, u, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);

type Insights = {
  public_builds: number;
  mods: {
    name: string;
    category: string;
    builds: number;
    complete_pct: number;
    hp_gain_low: number | null;
    hp_gain_typical: number | null;
    hp_gain_high: number | null;
    hp_reports: number | null;
  }[];
  categories: Record<string, number>;
};
const insights = async (viewer: string | null, make = "Subaru", model = "WRX", year: number | null = 2016) =>
  (await q<{ r: Insights }>(viewer, "select public.mod_insights($1, $2, $3) as r", [make, model, year]))[0]!.r;

async function build(u: string, opts: { pub?: boolean; model?: string; year?: number } = {}) {
  const [v] = await q<{ id: string }>(
    u,
    `insert into public.vehicles (year, make, model, baseline_hp, baseline_weight_lb) values ($1, 'Subaru', $2, 268, 3267) returning id`,
    [opts.year ?? 2015, opts.model ?? "WRX"],
  );
  await q(u, "select public.publish_build($1, $2)", [v!.id, opts.pub ?? true]);
  return v!.id;
}
async function mod(u: string, vehicle: string, name: string, hp: number | null, status = "complete") {
  await q(
    u,
    `insert into public.mods (vehicle_id, name, category, status, cost_minor, currency, notes, spec_deltas)
     values ($1, $2, 'engine', $3, 99999, 'USD', 'secret note', $4)`,
    [
      vehicle,
      name,
      status,
      JSON.stringify(hp === null ? { schema_version: 1 } : { schema_version: 1, hp: { delta: hp, unit: "hp" } }),
    ],
  );
}

beforeEach(async () => {
  db = await freshDb();
  for (let i = 1; i <= 6; i++) {
    await createAuthUser(db, uid(i), true);
    await setUsername(db, uid(i), `wrx_owner_${i}`);
  }
});
afterEach(async () => {
  await db.close();
});

describe("mod_insights", () => {
  it("counts public builds of the model, lists mods used by 2+ builds, and gives gains as a range", async () => {
    const gains = [10, 14, 20, 26, 40];
    for (let i = 1; i <= 5; i++) {
      const v = await build(uid(i));
      await mod(uid(i), v, i % 2 ? "Cold Air Intake" : "cold air  intake", gains[i - 1]!); // name variants group
      if (i <= 2) await mod(uid(i), v, "Coilovers", null, "planned");
    }
    const solo = await build(uid(6));
    await mod(uid(6), solo, "One-off turbo kit", 120); // only one build: never listed

    const r = await insights(null);
    expect(r.public_builds).toBe(6);
    expect(r.mods.map((m) => [m.name, m.builds])).toEqual([
      ["Cold Air Intake", 5],
      ["Coilovers", 2],
    ]);
    const intake = r.mods[0]!;
    // middle half of the 5 reports (25th-75th percentile) and the median, never a single "exact" number
    expect([intake.hp_gain_low, intake.hp_gain_typical, intake.hp_gain_high, intake.hp_reports]).toEqual([
      14, 20, 26, 5,
    ]);
    expect(intake.complete_pct).toBe(100);
    expect(r.mods[1]!.hp_gain_typical).toBeNull(); // planned mods carry no gains
    expect(JSON.stringify(r)).not.toMatch(/99999|secret note|wrx_owner|vin/i);
  });

  it("hides gains until at least 3 owners reported them", async () => {
    for (let i = 1; i <= 2; i++) await mod(uid(i), await build(uid(i)), "Downpipe", 30);
    const r = await insights(uid(3));
    expect(r.mods[0]).toMatchObject({ name: "Downpipe", builds: 2, hp_gain_low: null, hp_reports: null });
  });

  it("private, other-model, out-of-era and blocked builds never count", async () => {
    for (let i = 1; i <= 3; i++) await mod(uid(i), await build(uid(i)), "Intake", 15);
    await mod(uid(4), await build(uid(4), { pub: false }), "Intake", 15);
    await mod(uid(5), await build(uid(5), { model: "BRZ" }), "Intake", 15);
    await mod(uid(6), await build(uid(6), { year: 1995 }), "Intake", 15);
    expect((await insights(null)).mods[0]!.builds).toBe(3);
    // a viewer blocked by one owner doesn't see that owner's build in the numbers
    await q(uid(1), "insert into public.blocks (blocked_id) values ($1)", [uid(6)]);
    const seenByBlocked = await insights(uid(6));
    expect(seenByBlocked.public_builds).toBe(2);
    expect(seenByBlocked.mods[0]!.builds).toBe(2);
  });
});

describe("torq_chat_allow", () => {
  it("needs a signed-in user and stops at 20 messages an hour", async () => {
    expect(await q(uid(1), "select public.torq_chat_allow() as ok")).toEqual([{ ok: true }]);
    await expect(q(null, "select public.torq_chat_allow()")).rejects.toThrow(/permission denied|sign_in_required/);
    for (let i = 0; i < 19; i++)
      await db.query("insert into app_private.rate_events (user_id, action) values ($1, 'torq_chat_hour')", [uid(1)]);
    await expect(q(uid(1), "select public.torq_chat_allow()")).rejects.toThrow(/rate_limited/);
  });
});
