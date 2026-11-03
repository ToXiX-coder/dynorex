import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** D-62: who fitted a mod, recall alerts, dyno log, track laps, wishlist alerts. */
const A = "00000000-0000-4000-8000-000000000da1";
const B = "00000000-0000-4000-8000-000000000db1";
const C = "00000000-0000-4000-8000-000000000dc1";
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

async function car(uid: string, model = "WRX", year = 2015, visibility = "public") {
  const { id } = await one<{ id: string }>(
    uid,
    `insert into public.vehicles (year, make, model, visibility) values ($1, 'Subaru', $2, $3) returning id`,
    [year, model, visibility],
  );
  await q(uid, `insert into public.builds (vehicle_id, title, visibility) values ($1, 'Build', $2)`, [id, visibility]);
  return id;
}
const notes = (uid: string, category: string) =>
  q<{ title: string; body: string; entity_id: string }>(
    uid,
    "select title, body, entity_id from public.notifications where category = $1::public.notification_category",
    [category],
  );
const recall = (campaign: string, extra: Record<string, unknown> = {}) => ({
  campaign,
  component: "ELECTRICAL SYSTEM:WIRING",
  summary: "Some summary",
  consequence: "Could short",
  remedy: "Dealers will inspect",
  reported_on: "2017-06-10",
  ...extra,
});

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "picks_a"],
    [B, "picks_b"],
    [C, "picks_c"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("who fitted a mod", () => {
  it("is the owner's to write and stays off the public mod list", async () => {
    const v = await car(A);
    await q(
      A,
      "insert into public.mods (vehicle_id, name, category, status, installed_by) values ($1, 'Coilovers', 'suspension', 'complete', 'Big Block Garage')",
      [v],
    );
    expect(await q(A, "select installed_by from public.mods")).toEqual([{ installed_by: "Big Block Garage" }]);
    const pub = await q(null, "select * from public.public_mods");
    expect(pub).toHaveLength(1);
    expect(pub[0]).not.toHaveProperty("installed_by");
  });
});

describe("recall alerts", () => {
  it("match by make, model and year only, tell owners once, and stay private to each owner", async () => {
    const wrx = await car(A, "WRX", 2015);
    await car(A, "WRX", 2019); // different year
    const theirs = await car(B, " wrx ", 2015); // same car, typed differently
    expect(await fails(A, "select * from public.recall_targets()")).toMatch(/permission denied/);
    expect(await fails(A, "select public.store_recalls('Subaru','WRX',2015,'[]'::jsonb)")).toMatch(/permission denied/);

    const targets = (await db.query<{ model_year: number }>("select * from public.recall_targets()")).rows;
    expect(targets.map((t) => t.model_year).sort()).toEqual([2015, 2019]);

    const items = JSON.stringify([recall("17V625000"), recall("bad id!"), recall("19V100000", { park_it: true })]);
    await db.query("select public.store_recalls('SUBARU', 'WRX', 2015, $1::jsonb)", [items]);
    // the same answer again (tomorrow's check) tells nobody twice
    await db.query("select public.store_recalls('SUBARU', 'WRX', 2015, $1::jsonb)", [items]);
    const a = await notes(A, "recall");
    expect(a).toHaveLength(2);
    expect(a.map((n) => n.title).sort()).toEqual(["A recall may affect your car", "Recall: park it until fixed"]);
    expect(a[0]!.body).toMatch(/Check with a dealer using your VIN\.$/);
    expect(a.every((n) => n.entity_id === wrx)).toBe(true);
    expect(await notes(B, "recall")).toHaveLength(2);

    const list = await q<{ campaign: string; dismissed: boolean }>(
      A,
      "select campaign, dismissed from public.my_vehicle_recalls($1)",
      [wrx],
    );
    expect(list.map((r) => r.campaign).sort()).toEqual(["17V625000", "19V100000"]);
    // someone else's car: nothing, and they can't dismiss on it
    expect(await q(A, "select * from public.my_vehicle_recalls($1)", [theirs])).toEqual([]);
    expect(await fails(A, "select public.set_recall_dismissed($1, '17V625000', true)", [theirs])).toMatch(/not_found/);
    await q(A, "select public.set_recall_dismissed($1, '17V625000', true)", [wrx]);
    const after = await q<{ campaign: string; dismissed: boolean }>(
      A,
      "select campaign, dismissed from public.my_vehicle_recalls($1)",
      [wrx],
    );
    expect(after.find((r) => r.campaign === "17V625000")!.dismissed).toBe(true);
    expect(await fails(A, "select * from public.vehicle_recalls")).toMatch(/permission denied/);
  });

  it("respect the alert switch", async () => {
    await car(A);
    await q(A, "select public.set_notification_pref('recall', false)");
    await db.query("select public.store_recalls('Subaru', 'WRX', 2015, $1::jsonb)", [
      JSON.stringify([recall("20V000001")]),
    ]);
    expect(await notes(A, "recall")).toEqual([]);
  });
});

describe("dyno log", () => {
  const insert = `insert into public.dyno_results (vehicle_id, measured_on, dyno, correction, shop, whp, wtq, notes, shared)
                  values ($1, current_date, 'dynojet', 'sae', 'Garage 42', 268.4, 281, 'secret tune notes', $2) returning id`;

  it("is private unless shared, and shared results show numbers but never notes or the sheet", async () => {
    const v = await car(A);
    await q(A, insert, [v, true]);
    await q(A, insert, [v, false]);
    expect(await q(A, "select id from public.dyno_results")).toHaveLength(2);
    expect(await q(B, "select * from public.dyno_results")).toEqual([]);
    expect(await fails(B, insert, [v, false])).toMatch(/row-level security/);
    const pub = await q<Record<string, unknown>>(null, "select * from public.public_dyno_results");
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ dyno: "dynojet", correction: "sae", shop: "Garage 42" });
    expect(Number(pub[0]!.whp)).toBe(268.4);
    expect(pub[0]).not.toHaveProperty("notes");
    expect(pub[0]).not.toHaveProperty("sheet_path");
    expect(await fails(A, "update public.dyno_results set sheet_path = 'x'")).toMatch(/permission denied/);
    // D-63: once register-photo attaches the sheet, the shared result says so (the path itself never shows)
    expect(pub[0]).toMatchObject({ has_sheet: false });
    await db.query("update public.dyno_results set sheet_path = 'a/sheet.jpg' where shared");
    const withSheet = await q<Record<string, unknown>>(null, "select * from public.public_dyno_results");
    expect(withSheet[0]).toMatchObject({ has_sheet: true });
    expect(JSON.stringify(withSheet)).not.toContain("a/sheet.jpg");
    expect(
      await fails(
        A,
        "insert into public.dyno_results (vehicle_id, measured_on, dyno, whp) values ($1, current_date, 'dynojet', 5)",
        [v],
      ),
    ).toMatch(/check/);
  });

  it("disappears from a build made private and when deleted", async () => {
    const v = await car(A, "WRX", 2015, "private");
    const { id } = await one<{ id: string }>(A, insert, [v, true]);
    expect(await q(null, "select * from public.public_dyno_results")).toEqual([]);
    await q(A, "select public.soft_delete_dyno_result($1)", [id]);
    expect(await q(A, "select * from public.dyno_results")).toEqual([]);
  });
});

describe("track laps", () => {
  it("are private unless shared, and refuse impossible times", async () => {
    const v = await car(A);
    const ins = (ms: number, shared: boolean) =>
      q(
        A,
        "insert into public.track_laps (vehicle_id, track, lap_ms, driven_on, source, shared) values ($1, 'Thunderhill East', $2, current_date, 'racechrono', $3)",
        [v, ms, shared],
      );
    await ins(102310, true);
    await ins(103900, false);
    expect(await q(null, "select track, lap_ms, source from public.public_track_laps")).toEqual([
      { track: "Thunderhill East", lap_ms: 102310, source: "racechrono" },
    ]);
    expect(await q(B, "select * from public.track_laps")).toEqual([]);
    expect(
      await fails(
        A,
        "insert into public.track_laps (vehicle_id, track, lap_ms, driven_on) values ($1, 'X track', 5000, current_date)",
        [v],
      ),
    ).toMatch(/check/);
    expect(
      await fails(
        A,
        "insert into public.track_laps (vehicle_id, track, lap_ms, driven_on, source) values ($1, 'X track', 90000, current_date, 'stopwatch')",
        [v],
      ),
    ).toMatch(/check/);
  });
});

describe("wishlist alerts", () => {
  const list = (uid: string, title: string, fits: string | null) =>
    one<{ id: string }>(
      uid,
      `insert into public.listings (title, category, condition, price_minor, location_text, fits)
       values ($1, 'suspension', 'used', 60000, 'Sample City', $2) returning id`,
      [title, fits],
    );

  it("tell people whose wishlist and car match, once, never the seller or blocked people", async () => {
    const v = await car(A, "WRX");
    await q(A, "insert into public.wishlist_items (name, vehicle_id) values ('BC Racing coilovers', $1)", [v]);
    await q(B, "insert into public.wishlist_items (name) values ('Coilovers')"); // no car: name match is enough
    await q(C, "insert into public.wishlist_items (name) values ('Coilovers for my Miata')");
    await q(A, "insert into public.blocks (blocked_id) values ($1)", [C]);
    await q(B, "insert into public.wishlist_items (name) values ('Intake')");

    const wrong = await list(C, "Coilovers, two seasons", "2016-2020 Miata"); // A's car doesn't match
    expect(await notes(A, "wishlist_match")).toEqual([]);
    expect((await notes(B, "wishlist_match")).map((n) => n.entity_id)).toEqual([wrong.id]);
    expect(await notes(C, "wishlist_match")).toEqual([]); // the seller

    const right = await list(B, "BC coilovers, like new", "2015-2021 WRX");
    expect((await notes(A, "wishlist_match")).map((n) => n.entity_id)).toEqual([right.id]);
    // C's wishlist item has no car, so the word alone matches (B is the seller and hears nothing)
    expect((await notes(C, "wishlist_match")).map((n) => n.entity_id)).toEqual([right.id]);
    expect((await notes(A, "wishlist_match"))[0]!.body).toMatch(/matches "BC Racing coilovers"/);
    // a listing from someone A blocked never alerts A
    await list(C, "Coilovers for WRX", "WRX");
    expect(await notes(A, "wishlist_match")).toHaveLength(1);
  });
});
