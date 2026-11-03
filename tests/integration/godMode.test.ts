import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** D-68: supabase/migrations/20261027000000_god_mode.sql. */
const OWNER = "00000000-0000-4000-8000-000000000ad1";
const OTHER = "00000000-0000-4000-8000-000000000ad2";
const VIN = "JF1VA1C60G9812345";
let db: PGlite;

const q = <T = Record<string, any>>(uid: string | null, sql: string, params: unknown[] = []) =>
  as(db, uid, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
const one = async <T = Record<string, any>>(uid: string | null, sql: string, params: unknown[] = []) =>
  (await q<T>(uid, sql, params))[0]!;
const fails = (p: Promise<unknown>, msg: RegExp) => expect(p).rejects.toThrow(msg);

async function car(uid = OWNER, odometer: number | null = 61000) {
  return (
    await one<{ id: string }>(
      uid,
      "insert into public.vehicles (year, make, model, vin, odometer) values (2015, 'Subaru', 'WRX', $1, $2) returning id",
      [VIN, odometer],
    )
  ).id;
}
async function mod(vehicle: string, odo: number | null, uid = OWNER) {
  return (
    await one<{ id: string }>(
      uid,
      `insert into public.mods (vehicle_id, name, category, status, installed_on, installed_odometer)
       values ($1, 'Coilovers', 'suspension', 'complete', '2026-08-01', $2) returning id`,
      [vehicle, odo],
    )
  ).id;
}
const record = async (vehicle: string, uid = OWNER) =>
  (await one<{ r: any }>(uid, "select public.my_build_record($1) as r", [vehicle])).r;
const odometerOf = async (vehicle: string) =>
  Number((await one(OWNER, "select odometer from public.vehicles where id = $1", [vehicle])).odometer);

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [OWNER, "gm_owner"],
    [OTHER, "gm_other"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("mileage at install", () => {
  it("goes on the record and moves the odometer up, never down", async () => {
    const v = await car();
    await mod(v, 61900);
    expect((await record(v)).entries[0].odometer).toBe(61900);
    expect(await odometerOf(v)).toBe(61900);
    await mod(v, 40000);
    expect(await odometerOf(v)).toBe(61900);
    await fails(mod(v, 3_000_000), /installed_odometer/);
  });

  it("keeps the old reading when it's changed after the grace period, and shows it to the shop", async () => {
    const v = await car();
    const m = await mod(v, 61900);
    await db.query("update public.mods set status_changed_at = now() - interval '2 days' where id = $1", [m]);
    await q(OWNER, "update public.mods set installed_odometer = 62000 where id = $1", [m]);
    expect((await record(v)).entries[0].revisions[0].changed).toEqual(["installed_odometer"]);
    const token = (await one(OWNER, "select public.request_record_confirmation('mod', $1, null) as t", [m])).t;
    expect((await one(null, "select public.confirm_link_view($1) as v", [token])).v.entry.odometer).toBe(62000);
  });

  it("goes with the record when the car is sold", async () => {
    const v = await car();
    await mod(v, 61900);
    const { code } = await one(OWNER, "select public.start_vehicle_transfer($1) as code", [v]);
    const r = (await one(OTHER, "select public.claim_vehicle_transfer($1, $2) as r", [code, VIN])).r;
    expect(r.status).toBe("ok");
    expect((await record(r.vehicle_id, OTHER)).entries[0].odometer).toBe(61900);
  });
});

describe("build budget", () => {
  it("is the owner's to set, needs a currency, and stays off every public view", async () => {
    const v = await car();
    await q(OWNER, "update public.vehicles set budget_minor = 800000, budget_currency = 'USD' where id = $1", [v]);
    expect(await one(OWNER, "select budget_minor, budget_currency from public.vehicles where id = $1", [v])).toEqual({
      budget_minor: 800000,
      budget_currency: "USD",
    });
    await fails(
      q(OWNER, "update public.vehicles set budget_currency = null where id = $1", [v]),
      /vehicles_budget_pair/,
    );
    expect(await q(OTHER, "update public.vehicles set budget_minor = 1 where id = $1 returning id", [v])).toEqual([]);
    const cols = await q(
      null,
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name like 'public\\_%' and column_name like 'budget%'`,
    );
    expect(cols).toEqual([]);
  });
});

describe("cover from the gallery", () => {
  const photo = async (vehicle: string, owner = OWNER) =>
    (
      await db.query<{ id: string }>(
        "insert into public.vehicle_photos (owner_id, vehicle_id, storage_path, mime, bytes) values ($1, $2, $3, 'image/jpeg', 10) returning id",
        [owner, vehicle, `${owner}/${crypto.randomUUID()}.jpg`],
      )
    ).rows[0]!.id;

  it("points the cover at your own photo, and removing that photo clears it", async () => {
    const v = await car();
    const p = await photo(v);
    expect((await one(OTHER, "select public.set_cover_photo($1) as ok", [p])).ok).toBe(false);
    expect((await one(OWNER, "select public.set_cover_photo($1) as ok", [p])).ok).toBe(true);
    const path = (await one(OWNER, "select storage_path from public.vehicle_photos where id = $1", [p])).storage_path;
    expect((await one(OWNER, "select hero_path from public.vehicles where id = $1", [v])).hero_path).toBe(path);
    await q(OWNER, "select public.soft_delete_vehicle_photo($1)", [p]);
    expect((await one(OWNER, "select hero_path from public.vehicles where id = $1", [v])).hero_path).toBeNull();
  });

  it("still can't be set directly by the app", async () => {
    const v = await car();
    await fails(q(OWNER, "update public.vehicles set hero_path = 'x/y.jpg' where id = $1", [v]), /permission denied/);
  });
});

describe("receipt scan limit", () => {
  it("is for signed-in people only, ten an hour", async () => {
    await fails(q(null, "select public.receipt_scan_allow()"), /permission denied/);
    for (let i = 0; i < 10; i++) expect((await one(OWNER, "select public.receipt_scan_allow() as ok")).ok).toBe(true);
    await fails(q(OWNER, "select public.receipt_scan_allow()"), /rate/i);
  });
});
