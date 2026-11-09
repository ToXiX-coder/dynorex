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
    expect((await q<{ engine_cc: number }>("select engine_cc from public.vehicles where id = $1", [v!.id]))[0]!.engine_cc).toBe(700);
  });

  it("an owner can save an e-bike with its own numbers, a light weight, its class and a frame serial", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model, motor_w, battery_wh, range_mi, top_speed_mph, ebike_class,
         frame_serial, baseline_weight_lb, visibility)
       values ('ebike', 2024, 'Lectric', 'XP 3.0', 500, 499, 24, 28, 3, 'LX3-000123', 62, 'public') returning id`,
    );
    await q("select public.publish_build($1, true)", [v!.id]);
    const [pub] = await q<Record<string, unknown>>("select * from public.public_builds where vehicle_id = $1", [v!.id], null);
    expect(pub).toMatchObject({ kind: "ebike", motor_w: 500, ebike_class: 3 });
    expect(pub).not.toHaveProperty("frame_serial"); // private, like a VIN
    const [est] = await q<{ weight_status: string }>("select weight_status from public.vehicle_spec_estimate($1)", [v!.id]);
    expect(est!.weight_status).toBe("estimate");
  });

  it("an owner can save an e-moto with peak power past 20 kW, its pack voltage and road use (D-73)", async () => {
    const [v] = await q<{ id: string }>(
      `insert into public.vehicles (kind, year, make, model, motor_w, battery_wh, battery_v, street_legal, top_speed_mph,
         baseline_weight_lb, visibility)
       values ('ebike', 2026, 'Stark Future', 'Varg MX 1.2', 60000, 7200, 420, false, 60, 260, 'public') returning id`,
    );
    await q("select public.publish_build($1, true)", [v!.id]);
    const [pub] = await q<Record<string, unknown>>("select * from public.public_builds where vehicle_id = $1", [v!.id], null);
    expect(pub).toMatchObject({ motor_w: 60000, battery_v: 420, street_legal: false });
    expect(
      await fails("insert into public.vehicles (year, make, model, street_legal) values (2020, 'Subaru', 'WRX', true)"),
    ).toMatch(/vehicles_ebike_fields/);
  });

  it("keeps each kind's fields to that kind", async () => {
    expect(await fails("insert into public.vehicles (year, make, model, motor_w) values (2020, 'Subaru', 'WRX', 500)")).toMatch(
      /vehicles_ebike_fields/,
    );
    expect(
      await fails("insert into public.vehicles (kind, year, make, model, engine_cc) values ('ebike', 2024, 'Trek', 'Allant+ 7', 600)"),
    ).toMatch(/vehicles_engine_cc_motorcycle/);
    expect(
      await fails(
        "insert into public.vehicles (kind, year, make, model, vin) values ('ebike', 2024, 'Trek', 'Allant+ 7', 'JF1VA1A60F9800012')",
      ),
    ).toMatch(/vehicles_ebike_no_vin/);
    expect(await fails("insert into public.vehicles (year, make, model, baseline_weight_lb) values (2020, 'Subaru', 'WRX', 60)")).toMatch(
      /baseline_weight_lb/,
    );
    expect(
      await fails("insert into public.vehicles (kind, year, make, model, ebike_class) values ('ebike', 2024, 'Trek', 'Allant+ 7', 4)"),
    ).toMatch(/ebike_class/);
  });

  it("two-wheel mod categories can be used", async () => {
    const [v] = await q<{ id: string }>(
      "insert into public.vehicles (kind, year, make, model) values ('ebike', 2024, 'Trek', 'Allant+ 7') returning id",
    );
    await q("insert into public.mods (vehicle_id, name, category, status) values ($1, 'Range extender', 'battery', 'planned')", [
      v!.id,
    ]);
  });
});
