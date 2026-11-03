import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchStockSpec } from "@/domain/stockSpecs";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

/** Factory stock specs fill blank stock numbers; the owner's numbers always win (D-55). */
let db: PGlite;
const A = "00000000-0000-4000-8000-0000000009a1";
const q = <T = Record<string, unknown>>(u: string | null, sql: string, params: unknown[] = []) =>
  as(db, u, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);

type V = {
  baseline_hp: string | null;
  baseline_torque_lbft: string | null;
  baseline_weight_lb: string | null;
  baseline_zero_to_sixty_s: string | null;
  baseline_source: string | null;
  baseline_looked_up: string[];
  baseline_lookup_label: string | null;
};
const cols =
  "baseline_hp, baseline_torque_lbft, baseline_weight_lb, baseline_zero_to_sixty_s, baseline_source, baseline_looked_up, baseline_lookup_label";
async function add(year: number, make: string, model: string, extra: Record<string, unknown> = {}) {
  const keys = ["year", "make", "model", ...Object.keys(extra)];
  const vals = [year, make, model, ...Object.values(extra)];
  const [r] = await q<{ id: string }>(
    A,
    `insert into public.vehicles (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    vals,
  );
  return r!.id;
}
const get = async (id: string) => (await q<V>(A, `select ${cols} from public.vehicles where id = $1`, [id]))[0]!;

beforeEach(async () => {
  db = await freshDb();
  await createAuthUser(db, A, true);
  await setUsername(db, A, "spec_tester");
  await grantPlus(db, A); // more than the free 2 vehicles
});
afterEach(async () => {
  await db.close();
});

describe("factory stock specs", () => {
  it("blank stock numbers fill from the factory figures and drive the estimate", async () => {
    const id = await add(2015, "Subaru", "WRX");
    expect(await get(id)).toMatchObject({
      baseline_hp: "268.0",
      baseline_torque_lbft: "258.0",
      baseline_weight_lb: "3267.0",
      baseline_zero_to_sixty_s: "5.40",
      baseline_source: "external",
      baseline_looked_up: ["baseline_hp", "baseline_torque_lbft", "baseline_weight_lb", "baseline_zero_to_sixty_s"],
      baseline_lookup_label: "2015–2021 Subaru WRX",
    });
    const [est] = await q<{ hp: string; hp_status: string }>(A, "select * from public.vehicle_spec_estimate($1)", [id]);
    expect(est).toMatchObject({ hp_status: "estimate" });
    expect(Number(est!.hp)).toBe(268);
  });

  it("the owner's numbers win; only the blanks are filled", async () => {
    const id = await add(2015, "Subaru", "WRX", { baseline_hp: 280 });
    expect(await get(id)).toMatchObject({
      baseline_hp: "280.0",
      baseline_torque_lbft: "258.0",
      baseline_source: "user_reported",
      baseline_looked_up: ["baseline_torque_lbft", "baseline_weight_lb", "baseline_zero_to_sixty_s"],
    });
  });

  it("unrelated edits keep factory numbers; changing the car refreshes them; typing makes them yours", async () => {
    const id = await add(2015, "Subaru", "WRX");
    await q(A, "update public.vehicles set nickname = 'Weekend car', visibility = 'private' where id = $1", [id]);
    expect((await get(id)).baseline_source).toBe("external");
    await q(A, "update public.vehicles set model = 'WRX STI' where id = $1", [id]);
    expect(await get(id)).toMatchObject({ baseline_hp: "305.0", baseline_lookup_label: "2015–2018 Subaru WRX STI" });
    await q(A, "update public.vehicles set baseline_hp = 320 where id = $1", [id]);
    expect(await get(id)).toMatchObject({ baseline_hp: "320.0", baseline_source: "user_reported" });
    expect((await get(id)).baseline_looked_up).not.toContain("baseline_hp");
  });

  it("no match means nothing is invented, and 0–60 stays blank where no figure is on file", async () => {
    const none = await add(2018, "Honda", "Civic");
    expect(await get(none)).toMatchObject({ baseline_hp: null, baseline_source: null, baseline_looked_up: [] });
    const z06 = await add(2017, "Chevy", "Corvette Z06");
    expect((await get(z06)).baseline_hp).toBeNull(); // a faster variant never gets base-car numbers
    const brz = await add(2014, "Subaru", "BRZ");
    expect(await get(brz)).toMatchObject({ baseline_hp: "200.0", baseline_zero_to_sixty_s: null });
  });

  it("the client can't write the lookup bookkeeping itself", async () => {
    const id = await add(2015, "Subaru", "WRX");
    await expect(q(A, "update public.vehicles set baseline_looked_up = '{}' where id = $1", [id])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("anyone (even signed out) can look up what would fill in", async () => {
    const [r] = await q<{ r: unknown }>(null, "select public.lookup_stock_specs(1999, 'Mazda', 'MX-5 Miata') as r");
    expect(r!.r).toMatchObject({ label: "1999–2000 Mazda MX-5 Miata (NB)", hp: 140, torque_lbft: 119 });
    const [n] = await q<{ r: unknown }>(null, "select public.lookup_stock_specs(2018, 'Honda', 'Civic') as r");
    expect(n!.r).toBeNull();
  });

  it("the database matches exactly like the app", async () => {
    const cases: [number, string, string, string | null][] = [
      [2015, "Subaru", "WRX", null],
      [2016, "subaru", "WRX STI", null],
      [2016, "Subaru", "Impreza", "WRX STI"],
      [2017, "Ford", "Mustang", "GT"],
      [2017, "Ford", "Mustang", null],
      [2017, "Ford", "Mustang", "Shelby GT350"],
      [1996, "Toyota", "Supra", "Turbo"],
      [1996, "Toyota", "Supra", null],
      [2010, "Mazda", "MX-5 Miata", "Grand Touring"],
      [1997, "Nissan", "Skyline GT-R", "V-Spec"],
      [2012, "Mitsubishi", "Lancer", "Evolution X GSR"],
      [2019, "VW", "Golf GTI", null],
      [2022, "Ford", "Bronco Sport", null],
      [2017, "Nissan", "GT-R", "Nismo"],
      [2018, "Honda", "Civic", null],
      [2016, "Chevy", "Corvette", "Stingray"],
    ];
    for (const [year, make, model, trim] of cases) {
      const [r] = await q<{ label: string | null }>(
        null,
        "select (public.lookup_stock_specs($1, $2, $3, $4)) ->> 'label' as label",
        [year, make, model, trim],
      );
      const ts = matchStockSpec({ year, make, model, trim });
      const tsLabel = ts ? `${ts.from === ts.to ? ts.from : `${ts.from}–${ts.to}`} ${ts.label}` : null;
      expect([year, make, model, trim, r!.label]).toEqual([year, make, model, trim, tsLabel]);
    }
  });
});
