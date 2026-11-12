import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** D-71 / D-72: motorcycles and e-bikes, saved as the signed-in owner (the app's own rights, not the service role). */
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000a01";
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = [], u: string | null = owner) =>
  as(db, u, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
const fails = async (sql: string, params: unknown[] = []) => {
  try {
    await q(sql, params);
    return "";
  } catch (e) {
    return String((e as Error).message);
  }
};

beforeEach(async () => {
  db = await freshDb();
  await createAuthUser(db, owner, true);
  await setUsername(db, owner, "two_wheels");
});
afterEach(async () => {
  await db.close();
});

describe("vehicle kinds", () => {
  it("an owner can save and edit a motorcycle with its engine size", async () => {
    const [v] = await q<{ id: string; kind: string; baseline_looked_up: string[] }>(
      `insert into public.vehicles (kind, year, make, model, engine_cc, baseline_hp, baseline_weight_lb)
       values ('motorcycle', 2025, 'Yamaha', 'MT-07', 689, 72, 403) returning id, kind, baseline_looked_up`,
    );
    expect(v!.kind).toBe("motorcycle");
    expect(v!.baseline_looked_up).toEqual([]); // the car factory table never fills a motorcycle
    await q("update public.vehicles set engine_cc = 700 where id = $1", [v!.id]);
    expect(
      (await q<{ engine_cc: number }>("select engine_cc from public.vehicles where id = $1", [v!.id]))[0]!.engine_cc,
    ).toBe(700);
  });

  it("an owner can save an e-bike with its own numbers, a light weight, its class and a frame serial", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model, motor_w, battery_wh, range_mi, top_speed_mph, ebike_class,
         frame_serial, baseline_weight_lb, visibility)
       values ('ebike', 2024, 'Lectric', 'XP 3.0', 500, 499, 24, 28, 3, 'LX3-000123', 62, 'public') returning id`,
    );
    await q("select public.publish_build($1, true)", [v!.id]);
    const [pub] = await q<Record<string, unknown>>(
      "select * from public.public_builds where vehicle_id = $1",
      [v!.id],
      null,
    );
    expect(pub).toMatchObject({ kind: "ebike", motor_w: 500, ebike_class: 3 });
    expect(pub).not.toHaveProperty("frame_serial"); // private, like a VIN
    const [est] = await q<{ weight_status: string }>("select weight_status from public.vehicle_spec_estimate($1)", [
      v!.id,
    ]);
    expect(est!.weight_status).toBe("estimate");
  });

  it("an owner can save an e-moto with peak power past 20 kW, its pack voltage and road use (D-73)", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model, motor_w, battery_wh, battery_v, street_legal, top_speed_mph,
         baseline_weight_lb, visibility)
       values ('ebike', 2026, 'Stark Future', 'Varg MX 1.2', 60000, 7200, 420, false, 60, 260, 'public') returning id`,
    );
    await q("select public.publish_build($1, true)", [v!.id]);
    const [pub] = await q<Record<string, unknown>>(
      "select * from public.public_builds where vehicle_id = $1",
      [v!.id],
      null,
    );
    expect(pub).toMatchObject({ motor_w: 60000, battery_v: 420, street_legal: false });
    expect(
      await fails("insert into public.vehicles (year, make, model, street_legal) values (2020, 'Subaru', 'WRX', true)"),
    ).toMatch(/vehicles_ebike_fields/);
  });

  it("keeps each kind's fields to that kind", async () => {
    expect(
      await fails("insert into public.vehicles (year, make, model, motor_w) values (2020, 'Subaru', 'WRX', 500)"),
    ).toMatch(/vehicles_ebike_fields/);
    expect(
      await fails(
        "insert into public.vehicles (kind, year, make, model, engine_cc) values ('ebike', 2024, 'Trek', 'Allant+ 7', 600)",
      ),
    ).toMatch(/vehicles_engine_cc_motorcycle/);
    expect(
      await fails(
        "insert into public.vehicles (kind, year, make, model, vin) values ('ebike', 2024, 'Trek', 'Allant+ 7', 'JF1VA1A60F9800012')",
      ),
    ).toMatch(/vehicles_ebike_no_vin/);
    expect(
      await fails(
        "insert into public.vehicles (year, make, model, baseline_weight_lb) values (2020, 'Subaru', 'WRX', 60)",
      ),
    ).toMatch(/baseline_weight_lb/);
    expect(
      await fails(
        "insert into public.vehicles (kind, year, make, model, ebike_class) values ('ebike', 2024, 'Trek', 'Allant+ 7', 4)",
      ),
    ).toMatch(/ebike_class/);
  });

  it("two-wheel mod categories can be used", async () => {
    const [v] = await q<{ id: string }>(
      "insert into public.vehicles (kind, year, make, model) values ('ebike', 2024, 'Trek', 'Allant+ 7') returning id",
    );
    await q(
      "insert into public.mods (vehicle_id, name, category, status) values ($1, 'Range extender', 'battery', 'planned')",
      [v!.id],
    );
  });
});

describe("handing a two-wheeler to its buyer (D-74)", () => {
  const buyer = "00000000-0000-4000-8000-000000000a02";
  const one = async (sql: string, params: unknown[], u: string | null) =>
    (await q<Record<string, any>>(sql, params, u))[0]!;
  beforeEach(async () => {
    await createAuthUser(db, buyer, true);
    await setUsername(db, buyer, "next_rider");
  });

  it("an e-moto is checked and claimed by its frame number, and arrives as an e-moto", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model, motor_w, battery_v, battery_wh, street_legal, frame_serial)
       values ('ebike', 2025, 'Sur-Ron', 'Ultra Bee', 12500, 74, 4070, true, 'UB25-00042') returning id`,
    );
    const { t: token } = await one("select public.create_history_share($1) as t", [v!.id], owner);
    const check = async (s: string) => (await one("select public.check_record_vin($1, $2) as s", [token, s], null)).s;
    expect(await check("ub25 00042")).toBe("match");
    expect(await check("UB25-00043")).toBe("no_match");
    // the shared record says it's an e-moto
    const rec = await one("select public.build_record($1) as r", [token], null);
    expect(rec.r.car.kind).toBe("ebike");
    // a locked frame number can't change
    expect(await fails("update public.vehicles set frame_serial = 'OTHER-1' where id = $1", [v!.id])).toMatch(
      /vin_locked/,
    );

    const { code } = await one("select public.start_vehicle_transfer($1) as code", [v!.id], owner);
    const claim = async (s: string) =>
      (await one("select public.claim_vehicle_transfer($1, $2) as r", [code, s], buyer)).r;
    expect((await claim("UB25-99999")).status).toBe("vin_mismatch");
    const r = await claim("UB2500042");
    expect(r.status).toBe("ok");
    const got = await one(
      "select kind, motor_w, battery_v, battery_wh, street_legal, frame_serial from public.vehicles where id = $1",
      [r.vehicle_id],
      buyer,
    );
    expect(got).toEqual({
      kind: "ebike",
      motor_w: 12500,
      battery_v: 74,
      battery_wh: 4070,
      street_legal: true,
      frame_serial: "UB25-00042",
    });
  });

  it("an e-moto without a frame number can't start a transfer", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model) values ('ebike', 2025, 'Talaria', 'Sting R MX4') returning id`,
    );
    expect(await fails("select public.start_vehicle_transfer($1)", [v!.id])).toMatch(/vin_required/);
  });

  it("a motorcycle stays a motorcycle, with its engine size", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model, engine_cc, vin) values ('motorcycle', 2025, 'Yamaha', 'MT-07', 689, 'JYARM36E0SA000123') returning id`,
    );
    const { code } = await one("select public.start_vehicle_transfer($1) as code", [v!.id], owner);
    const r = (await one("select public.claim_vehicle_transfer($1, $2) as r", [code, "JYARM36E0SA000123"], buyer)).r;
    expect(r.status).toBe("ok");
    expect(await one("select kind, engine_cc from public.vehicles where id = $1", [r.vehicle_id], buyer)).toEqual({
      kind: "motorcycle",
      engine_cc: 689,
    });
  });
});

describe("runs and mods for two wheels (D-74)", () => {
  it("saves a motorcycle run with its real weight, and an e-moto's 0-30", async () => {
    const [moto] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model) values ('motorcycle', 2025, 'Yamaha', 'MT-07') returning id`,
    );
    await q(
      `insert into public.perf_runs (vehicle_id, zero_sixty_s, weight_lb, est_whp, sample_hz, quality) values ($1, 3.9, 403, 70, 10, 'good')`,
      [moto!.id],
    );
    const [em] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model) values ('ebike', 2025, 'Sur-Ron', 'Ultra Bee') returning id`,
    );
    await q(
      `insert into public.perf_runs (vehicle_id, zero_thirty_s, sample_hz, quality) values ($1, 2.97, 10, 'good')`,
      [em!.id],
    );
    expect(
      await fails(`insert into public.perf_runs (vehicle_id, sample_hz, quality) values ($1, 10, 'good')`, [em!.id]),
    ).toMatch(/measured/);
  });

  it("an e-moto's newest complete controller or battery mod shows on its public build", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model, motor_w, battery_v, battery_wh, visibility)
       values ('ebike', 2025, 'Sur-Ron', 'Light Bee X', 8000, 60, 2400, 'public') returning id`,
    );
    await q("select public.publish_build($1, true)", [v!.id]);
    await q(
      `insert into public.mods (vehicle_id, name, category, status, sets_motor_w, installed_on) values ($1, 'Controller', 'motor', 'complete', 12000, '2026-05-01')`,
      [v!.id],
    );
    await q(
      `insert into public.mods (vehicle_id, name, category, status, sets_motor_w) values ($1, 'Bigger controller', 'motor', 'planned', 20000)`,
      [v!.id],
    );
    await q(
      `insert into public.mods (vehicle_id, name, category, status, sets_battery_v, sets_battery_wh, installed_on) values ($1, '72V pack', 'battery', 'complete', 72, 2880, '2026-06-01')`,
      [v!.id],
    );
    const [pub] = await q<Record<string, unknown>>(
      "select motor_w, mod_motor_w, mod_battery_v, mod_battery_wh from public.public_builds where vehicle_id = $1",
      [v!.id],
      null,
    );
    expect(pub).toEqual({ motor_w: 8000, mod_motor_w: 12000, mod_battery_v: 72, mod_battery_wh: 2880 });
  });
});
