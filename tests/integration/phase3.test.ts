import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateSpecs, type ModForSpecs, type SpecDeltas } from "@/domain/specs";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

const A = "00000000-0000-4000-8000-0000000000a3";
const B = "00000000-0000-4000-8000-0000000000b3";
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

const newVehicle = async (uid: string, extra = "") =>
  (
    await q<{ id: string }>(
      uid,
      `insert into public.vehicles (year, make, model${extra ? ", " + extra.split("=")[0] : ""}) values (2004, 'Sample', 'Car'${extra ? ", " + extra.split("=")[1] : ""}) returning id`,
    )
  )[0]!.id;

beforeEach(async () => {
  db = await freshDb();
  await createAuthUser(db, A, true);
  await createAuthUser(db, B, true);
  await setUsername(db, A, "sample_a3");
  await setUsername(db, B, "sample_b3");
});
afterEach(async () => {
  await db.close();
});

describe("free-plan limits", () => {
  it("2 vehicles on Free; deleting one frees the slot; Dynorex+ (override) lifts it", async () => {
    const v1 = await newVehicle(A);
    await newVehicle(A);
    expect(await fails(A, "insert into public.vehicles (year, make, model) values (2000, 'a', 'b')")).toMatch(
      /plan_limit_vehicles/,
    );
    await q(A, "select public.soft_delete_vehicle($1)", [v1]);
    await newVehicle(A);
    await grantPlus(db, A);
    await newVehicle(A);
    expect(await q(A, "select * from public.my_plan()")).toEqual([
      { plus: true, vehicle_limit: null, mods_per_vehicle_limit: null },
    ]);
    expect(await q(B, "select * from public.my_plan()")).toEqual([
      { plus: false, vehicle_limit: 2, mods_per_vehicle_limit: 20 },
    ]);
  });

  it("20 mods per vehicle on Free", async () => {
    const v = await newVehicle(A);
    for (let i = 0; i < 20; i++)
      await q(A, "insert into public.mods (vehicle_id, name, category) values ($1, $2, 'engine')", [v, `m${i}`]);
    expect(
      await fails(A, "insert into public.mods (vehicle_id, name, category) values ($1, 'one more', 'engine')", [v]),
    ).toMatch(/plan_limit_mods/);
  });

  it("can't be bypassed by asking for Plus or reading overrides", async () => {
    expect(await fails(A, "insert into app_private.plan_overrides (user_id, reason) values ($1, 'me')", [A])).toMatch(
      /permission denied/,
    );
    expect(await fails(A, "select public.user_has_plus($1)", [A])).toMatch(/permission denied/);
  });
});

describe("idempotent creates", () => {
  it("the same client_ref can't create a second vehicle or mod", async () => {
    const ref = "11111111-2222-4333-8444-555555555555";
    const v = await newVehicle(A, `client_ref='${ref}'`);
    expect(
      await fails(A, "insert into public.vehicles (year, make, model, client_ref) values (2004, 'Sample', 'Car', $1)", [
        ref,
      ]),
    ).toMatch(/duplicate key|unique/);
    await q(A, "insert into public.mods (vehicle_id, name, category, client_ref) values ($1, 'x', 'engine', $2)", [
      v,
      ref,
    ]);
    expect(
      await fails(
        A,
        "insert into public.mods (vehicle_id, name, category, client_ref) values ($1, 'x', 'engine', $2)",
        [v, ref],
      ),
    ).toMatch(/duplicate key|unique/);
    // a different owner can use the same ref
    await newVehicle(B, `client_ref='${ref}'`);
  });
});

describe("spec deltas contract", () => {
  it("accepts the typed shape and rejects everything else", async () => {
    const v = await newVehicle(A);
    const ins = (d: unknown) =>
      q(A, "insert into public.mods (vehicle_id, name, category, spec_deltas) values ($1, 'x', 'engine', $2)", [
        v,
        JSON.stringify(d),
      ]);
    await ins({ schema_version: 1, hp: { delta: 15, unit: "hp" }, weight: { delta: -10, unit: "kg" } });
    for (const bad of [
      { schema_version: 2 },
      { schema_version: 1, horsepower: { delta: 5, unit: "hp" } },
      { schema_version: 1, hp: { delta: 5, unit: "ps" } },
      { schema_version: 1, hp: { delta: "5", unit: "hp" } },
      { schema_version: 1, hp: { delta: 99999, unit: "hp" } },
      { schema_version: 1, hp: { delta: 5, unit: "hp", note: "x" } },
    ]) {
      await expect(ins(bad), JSON.stringify(bad)).rejects.toThrow(/check constraint/);
    }
  });

  it("server keeps status_changed_at", async () => {
    const v = await newVehicle(A);
    const [m] = await q<{ id: string; status_changed_at: string }>(
      A,
      "insert into public.mods (vehicle_id, name, category) values ($1, 'x', 'engine') returning id, status_changed_at",
      [v],
    );
    await db.query("update public.mods set status_changed_at = '2000-01-01' where id = $1", [m!.id]);
    await q(A, "update public.mods set status = 'complete' where id = $1", [m!.id]);
    const [after] = await q<{ status_changed_at: string }>(
      A,
      "select status_changed_at from public.mods where id = $1",
      [m!.id],
    );
    expect(new Date(after!.status_changed_at).getFullYear()).toBeGreaterThan(2000);
    expect(await fails(A, "update public.mods set status_changed_at = now() where id = $1", [m!.id])).toMatch(
      /permission denied/,
    );
  });
});

describe("server spec estimate matches the app's formula", () => {
  // deterministic pseudo-random generator so failures are reproducible
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const maybe = <T>(f: () => T) => (rnd() < 0.7 ? f() : undefined);

  it("on 40 random cars with 0-6 mods each", async () => {
    for (let car = 0; car < 40; car++) {
      const base = {
        baseline_hp: rnd() < 0.85 ? Math.round(rnd() * 600 + 60) : null,
        baseline_torque_lbft: rnd() < 0.8 ? Math.round(rnd() * 500 + 60) : null,
        baseline_weight_lb: rnd() < 0.8 ? Math.round(rnd() * 3000 + 1500) : null,
        baseline_zero_to_sixty_s: rnd() < 0.7 ? Math.round((rnd() * 10 + 2.5) * 100) / 100 : null,
      };
      // inserted through the trusted path (no end user) so hourly rate limits don't cap the sample size
      const [{ id } = { id: "" }] = (
        await db.query<{ id: string }>(
          "insert into public.vehicles (owner_id, year, make, model, baseline_hp, baseline_torque_lbft, baseline_weight_lb, baseline_zero_to_sixty_s) values ($1, 2000, 'S', 'C', $2, $3, $4, $5) returning id",
          [A, base.baseline_hp, base.baseline_torque_lbft, base.baseline_weight_lb, base.baseline_zero_to_sixty_s],
        )
      ).rows;
      const mods: ModForSpecs[] = [];
      const n = Math.floor(rnd() * 7);
      for (let i = 0; i < n; i++) {
        const d: SpecDeltas = { schema_version: 1 };
        const hp = maybe(() => ({
          delta: Math.round((rnd() * 200 - 60) * 10) / 10,
          unit: pick(["hp", "kw"] as const),
        }));
        const tq = maybe(() => ({
          delta: Math.round((rnd() * 150 - 40) * 10) / 10,
          unit: pick(["lb-ft", "nm"] as const),
        }));
        const wt = maybe(() => ({ delta: Math.round(rnd() * 200 - 120), unit: pick(["lb", "kg"] as const) }));
        const zs = maybe(() => ({ delta: Math.round((rnd() * 1.2 - 0.9) * 100) / 100, unit: "s" as const }));
        if (hp) d.hp = hp;
        if (tq) d.torque = tq;
        if (wt) d.weight = wt;
        if (zs) d.zero_to_sixty = zs;
        const status = pick(["planned", "in_progress", "complete", "complete"] as const);
        mods.push({ status, spec_deltas: d });
        await db.query(
          "insert into public.mods (owner_id, vehicle_id, name, category, status, spec_deltas) values ($1, $2, 'm', 'engine', $3, $4)",
          [A, id, status, JSON.stringify(d)],
        );
      }
      const [sql] = await q<Record<string, string | number | null>>(
        A,
        "select * from public.vehicle_spec_estimate($1)",
        [id],
      );
      const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
      const fromSql = Object.fromEntries(Object.entries(sql!).map(([k, v]) => [k, k.endsWith("_status") ? v : num(v)]));
      expect(fromSql, `car ${car}`).toEqual(estimateSpecs(base, mods));
    }
  });

  it("is limited by RLS: other people's vehicles return nothing", async () => {
    const v = await newVehicle(A);
    expect(await q(B, "select * from public.vehicle_spec_estimate($1)", [v])).toEqual([]);
    expect(await fails(null, "select * from public.vehicle_spec_estimate($1)", [v])).toMatch(/permission denied/);
  });
});

describe("cost summary", () => {
  it("spent = complete + in progress, planned separate, per currency and category, owner only", async () => {
    const v = await newVehicle(A);
    const add = (status: string, cost: number | null, currency: string | null, category = "engine") =>
      q(
        A,
        "insert into public.mods (vehicle_id, name, category, status, cost_minor, currency) values ($1, 'm', $2, $3, $4, $5)",
        [v, category, status, cost, currency],
      );
    await add("complete", 10000, "USD");
    await add("in_progress", 2500, "USD");
    await add("planned", 50000, "USD");
    await add("complete", 7000, "USD", "wheels");
    await add("complete", 9000, "CAD");
    await add("complete", null, null); // no cost: ignored
    const rows = await q<{ currency: string; category: string; spent_minor: string; planned_minor: string }>(
      A,
      "select * from public.vehicle_cost_summary($1)",
      [v],
    );
    const simple = rows.map((r) => [r.currency, r.category, Number(r.spent_minor), Number(r.planned_minor)]);
    expect(simple).toEqual([
      ["CAD", "engine", 9000, 0],
      ["USD", "engine", 12500, 50000],
      ["USD", "wheels", 7000, 0],
    ]);
    expect(await q(B, "select * from public.vehicle_cost_summary($1)", [v])).toEqual([]);
  });
});

describe("photos are written by the server only", () => {
  it("clients can't create photo rows or set the hero image; owners can soft-delete their own photos", async () => {
    const v = await newVehicle(A);
    const [m] = await q<{ id: string }>(
      A,
      "insert into public.mods (vehicle_id, name, category) values ($1, 'x', 'engine') returning id",
      [v],
    );
    expect(
      await fails(
        A,
        "insert into public.mod_photos (mod_id, storage_path, mime, bytes) values ($1, $2, 'image/jpeg', 10)",
        [m!.id, `${A}/x.jpg`],
      ),
    ).toMatch(/permission denied/);
    expect(await fails(A, "update public.vehicles set hero_path = $1 where id = $2", [`${A}/h.jpg`, v])).toMatch(
      /permission denied/,
    );
    // what register-photo does (service role)
    const [p] = (
      await db.query<{ id: string }>(
        "insert into public.mod_photos (owner_id, mod_id, storage_path, mime, bytes) values ($1, $2, $3, 'image/jpeg', 10) returning id",
        [A, m!.id, `${A}/ok.jpg`],
      )
    ).rows;
    expect((await q<{ ok: boolean }>(B, "select public.soft_delete_mod_photo($1) as ok", [p!.id]))[0]!.ok).toBe(false);
    expect((await q<{ ok: boolean }>(A, "select public.soft_delete_mod_photo($1) as ok", [p!.id]))[0]!.ok).toBe(true);
    expect(await fails(A, "select public.enforce_rate_limit_for($1, 'photo_upload', 20, 3600)", [A])).toMatch(
      /permission denied/,
    );
  });
});

describe("storage policies (vehicle-media bucket)", () => {
  const put = (uid: string, name: string) =>
    q(uid, "insert into storage.objects (bucket_id, name) values ('vehicle-media', $1)", [name]);
  const file = (owner: string) => `${owner}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;

  it("is private, 10 MB, images only", async () => {
    const [b] = (
      await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
        "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'vehicle-media'",
      )
    ).rows;
    expect({ ...b, file_size_limit: Number(b!.file_size_limit) }).toEqual({
      public: false,
      file_size_limit: 10485760,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    });
  });

  it("owners write, read and delete only inside their own folder", async () => {
    await put(A, file(A));
    expect(
      await fails(A, "insert into storage.objects (bucket_id, name) values ('vehicle-media', $1)", [file(B)]),
    ).toMatch(/row-level security/);
    expect(
      await fails(A, "insert into storage.objects (bucket_id, name) values ('vehicle-media', $1)", [
        `${A}/../${B}/x.jpg`,
      ]),
    ).toMatch(/row-level security/);
    expect(
      await fails(A, "insert into storage.objects (bucket_id, name) values ('vehicle-media', $1)", [`${A}/evil.svg`]),
    ).toMatch(/row-level security/);
    expect(await q(B, "select name from storage.objects")).toEqual([]);
    expect(await q(A, "select name from storage.objects")).toEqual([{ name: file(A) }]);
    const del = await as(db, B, (tx) => tx.query("delete from storage.objects"));
    expect(del.affectedRows).toBe(0);
    expect(await fails(null, "select * from storage.objects")).toMatch(/permission denied/);
  });
});

describe("wishlist", () => {
  it("https links only, owner only, affiliate flag server-only, soft delete via function", async () => {
    const ins = (url: string | null) =>
      q(A, "insert into public.wishlist_items (name, url) values ('Part', $1) returning id", [url]);
    const [{ id } = { id: "" }] = await ins("https://shop.example.com/p/1");
    await ins(null);
    for (const bad of [
      "http://shop.example.com",
      "javascript:alert(1)",
      "https://user:pw@shop.example.com/x",
      "https://shop.example.com/a b",
    ]) {
      await expect(ins(bad), bad).rejects.toThrow(/check constraint/);
    }
    expect(await fails(A, "update public.wishlist_items set is_affiliate = true where id = $1", [id])).toMatch(
      /permission denied/,
    );
    expect(await q(B, "select id from public.wishlist_items")).toEqual([]);
    expect((await q<{ ok: boolean }>(B, "select public.soft_delete_wishlist_item($1) as ok", [id]))[0]!.ok).toBe(false);
    expect((await q<{ ok: boolean }>(A, "select public.soft_delete_wishlist_item($1) as ok", [id]))[0]!.ok).toBe(true);
    expect(await q(A, "select id from public.wishlist_items where id = $1", [id])).toEqual([]);
  });
});
