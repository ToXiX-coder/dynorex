import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** D-64: the Build Record (supabase/migrations/20261026000000_build_record.sql). */
const SELLER = "00000000-0000-4000-8000-000000000fa1";
const BUYER = "00000000-0000-4000-8000-000000000fb1";
const SHOP = "00000000-0000-4000-8000-000000000fc1";
const VIN = "JF1VA1C60G9812345";
let db: PGlite;

const q = <T = Record<string, any>>(uid: string | null, sql: string, params: unknown[] = []) =>
  as(db, uid, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
const one = async <T = Record<string, any>>(uid: string | null, sql: string, params: unknown[] = []) =>
  (await q<T>(uid, sql, params))[0]!;
const fails = (p: Promise<unknown>, msg: RegExp) => expect(p).rejects.toThrow(msg);

async function car(uid = SELLER, vin: string | null = VIN) {
  return (await one<{ id: string }>(uid, "insert into public.vehicles (year, make, model, vin) values (2016, 'Subaru', 'WRX', $1) returning id", [vin])).id;
}
type M = { name?: string; category?: string; status?: string; compliance?: string | null; carb_eo?: string | null };
async function mod(vehicle: string, m: M = {}, uid = SELLER) {
  return (
    await one<{ id: string }>(
      uid,
      `insert into public.mods (vehicle_id, name, category, status, brand, cost_minor, currency, notes, installed_by,
         compliance, carb_eo, installed_on)
       values ($1, $2, $3, $4, 'Kessler', 180000, 'USD', 'garage code 4411', 'Apex Tuning', $5, $6, '2025-03-01')
       returning id`,
      [vehicle, m.name ?? "Coilovers", m.category ?? "suspension", m.status ?? "complete", m.compliance ?? null, m.carb_eo ?? null],
    )
  ).id;
}
/** Pretend an entry went on the record two days ago (past the 24-hour grace period). */
const age = (table: string, id: string) =>
  db.query(
    `update public.${table} set ${table === "mods" ? "status_changed_at" : "created_at"} = now() - interval '2 days', created_at = now() - interval '2 days' where id = $1`,
    [id],
  );
const record = async (vehicle: string, uid = SELLER) =>
  (await one<{ r: any }>(uid, "select public.my_build_record($1) as r", [vehicle])).r;
const linkFor = async (type: string, id: string) =>
  (await one<{ t: string }>(SELLER, "select public.request_record_confirmation($1, $2, null) as t", [type, id])).t;
const shareFor = async (vehicle: string) =>
  (await one<{ t: string }>(SELLER, "select public.create_history_share($1) as t", [vehicle])).t;

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [SELLER, "rec_seller"],
    [BUYER, "rec_buyer"],
    [SHOP, "rec_shop"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("history that keeps its edits", () => {
  it("lets you fix a typo for 24 hours, then keeps the old version of each edit", async () => {
    const v = await car();
    const m = await mod(v);
    await q(SELLER, "update public.mods set brand = 'Kesler' where id = $1", [m]);
    expect((await record(v)).entries[0].version).toBe(0);

    await age("mods", m);
    await q(SELLER, "update public.mods set brand = 'Bilstein', notes = 'private change', cost_minor = 1 where id = $1", [m]);
    const e = (await record(v)).entries[0];
    expect(e.version).toBe(1);
    expect(e.revisions[0].changed).toEqual(["brand"]); // costs and notes are never tracked
    const rev = await one(SELLER, "select snapshot from public.record_revisions where entry_id = $1", [m]);
    expect(rev.snapshot.brand).toBe("Kesler");
    expect(JSON.stringify(rev.snapshot)).not.toContain("garage code");
  });

  it("shows a removal after the grace period, but not a quick delete or an unfinished plan", async () => {
    const v = await car();
    const kept = await mod(v, { name: "Sway bars" });
    const quick = await mod(v, { name: "Typo" });
    await mod(v, { name: "Turbo someday", status: "planned" });
    await age("mods", kept);
    await q(SELLER, "select public.soft_delete_mod($1)", [kept]);
    await q(SELLER, "select public.soft_delete_mod($1)", [quick]);
    const entries = (await record(v)).entries;
    expect(entries.map((e: any) => e.title)).toEqual(["Sway bars"]);
    expect(entries[0].removed_at).not.toBeNull();
  });

  it("matches the emissions status to the part", async () => {
    const v = await car();
    await fails(mod(v, { category: "engine", compliance: "not_emissions_related" }), /mods_compliance_fits/);
    await fails(mod(v, { category: "suspension", compliance: "off_road_only" }), /mods_compliance_fits/);
    await fails(mod(v, { category: "exhaust", compliance: "carb_eo" }), /mods_eo_needs_number/);
    await fails(mod(v, { category: "exhaust", compliance: "carb_eo", carb_eo: "D-12" }), /mods_carb_eo_check/);
    await mod(v, { category: "electronics", compliance: "not_emissions_related" });
  });
});

describe("shop confirmation", () => {
  it("is never asked for emissions work without a CARB EO, or for a plan", async () => {
    const v = await car();
    await fails(linkFor("mod", await mod(v, { category: "engine", compliance: "unknown" })), /emissions/);
    await fails(linkFor("mod", await mod(v, { category: "exhaust" })), /emissions/);
    await fails(linkFor("mod", await mod(v, { status: "planned" })), /not_finished/);
    expect(await linkFor("mod", await mod(v, { category: "engine", compliance: "carb_eo", carb_eo: "D-142-44" }))).toMatch(/^[0-9a-f]{64}$/);
    expect(await linkFor("mod", await mod(v, { category: "engine", compliance: "stock" }))).toMatch(/^[0-9a-f]{64}$/);
    await fails(q(BUYER, "select public.request_record_confirmation('mod', $1, null)", [await mod(v)]), /not_found/);
  });

  it("shows the shop the job, not the owner, VIN, cost or notes, works once and tells the owner", async () => {
    const v = await car();
    const m = await mod(v);
    const token = await linkFor("mod", m);
    expect(await linkFor("mod", m)).toBe(token);
    const view = (await one(null, "select public.confirm_link_view($1) as v", [token])).v;
    expect(view.status).toBe("open");
    expect(view.entry.title).toBe("Coilovers");
    for (const secret of [VIN, SELLER, "rec_seller", "180000", "garage code"]) expect(JSON.stringify(view)).not.toContain(secret);

    const answer = async () =>
      (await one(null, "select public.confirm_by_link($1, 'confirmed', 'Apex Tuning', 'Denver', 41010, null) as s", [token])).s;
    expect(await answer()).toBe("ok");
    expect(await answer()).toBe("closed");
    const e = (await record(v)).entries[0];
    expect(e.confirmation).toMatchObject({ decision: "confirmed", via: "link", shop_name: "Apex Tuning", version: 0 });
    expect(await q(SELLER, "select 1 from public.notifications where category = 'record_confirm_answer'")).toHaveLength(1);
    await fails(linkFor("mod", m), /already_confirmed/);

    // an edit after the shop answered shows on the record (the shop saw version 0)
    await age("mods", m);
    await q(SELLER, "update public.mods set part_number = 'KS-1' where id = $1", [m]);
    const after = (await record(v)).entries[0];
    expect([after.version, after.confirmation.version]).toEqual([1, 0]);
  });

  it("won't take an answer about an entry that changed after the link was sent", async () => {
    const v = await car();
    const m = await mod(v);
    await age("mods", m);
    const token = await linkFor("mod", m);
    await q(SELLER, "update public.mods set brand = 'Other' where id = $1", [m]);
    expect((await one(null, "select public.confirm_by_link($1, 'confirmed', 'Apex', null, null, null) as s", [token])).s).toBe("changed");
  });

  it("lets a Dynorex shop answer from its own account", async () => {
    const { id: biz } = await one(
      SHOP,
      "insert into public.businesses (name, location_text) values ('Apex Tuning', 'Denver, CO') returning id",
    );
    const v = await car();
    const m = await mod(v);
    await q(SELLER, "select public.request_record_confirmation('mod', $1, $2)", [m, biz]);
    expect(await q(SHOP, "select 1 from public.notifications where category = 'record_confirm_request'")).toHaveLength(1);
    const inbox = await q(SHOP, "select request_id, customer, job, status from public.shop_confirm_requests()");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!).toMatchObject({ customer: "rec_seller", status: "open" });
    expect(JSON.stringify(inbox[0]!.job)).not.toContain(VIN);
    expect(await q(BUYER, "select * from public.shop_confirm_requests()")).toEqual([]);

    const ans = (await one(SHOP, "select public.answer_record_confirmation($1, 'confirmed', null, 'Did the alignment too') as s", [
      inbox[0]!.request_id,
    ])).s;
    expect(ans).toBe("ok");
    expect((await record(v)).entries[0].confirmation).toMatchObject({ via: "shop_account", shop_name: "Apex Tuning", shop_city: "Denver, CO" });
    await fails(q(SHOP, "select public.request_record_confirmation('mod', $1, $2)", [m, biz]), /not_found/);
  });
});

describe("the buyer's link", () => {
  it("shows the record without the VIN, owner, costs or notes, and checks a VIN without showing it", async () => {
    const v = await car();
    const m = await mod(v);
    await db.query(
      "insert into public.receipts (owner_id, vehicle_id, mod_id, storage_path, mime, bytes, sha256) values ($1, $2, $3, $4, 'image/jpeg', 100, $5)",
      [SELLER, v, m, `${SELLER}/receipts/r.jpg`, "a".repeat(64)],
    );
    const token = await shareFor(v);
    const r = (await one(null, "select public.build_record($1) as r", [token])).r;
    expect(r.entries[0].receipts).toHaveLength(1);
    for (const secret of [VIN, SELLER, "rec_seller", "180000", "garage code", "receipts/r.jpg"]) {
      expect(JSON.stringify(r)).not.toContain(secret);
    }
    const check = async (vin: string) => (await one(null, "select public.check_record_vin($1, $2) as s", [token, vin])).s;
    expect(await check("jf1va1c60g9812345")).toBe("match");
    expect(await check("JF1VA1C60G9812346")).toBe("no_match");
    for (let i = 0; i < 8; i++) await check("x");
    expect(await check(VIN)).toBe("too_many");
  });

  it("locks the VIN once a buyer's link exists", async () => {
    const v = await car();
    await shareFor(v);
    await fails(q(SELLER, "update public.vehicles set vin = 'JF1VA1C60G9899999' where id = $1", [v]), /vin_locked/);
  });
});

describe("handing the record to the buyer", () => {
  it("needs a VIN, and both the code and the VIN off the car", async () => {
    await fails(q(SELLER, "select public.start_vehicle_transfer($1)", [await car(SELLER, null)]), /vin_required/);
    const v = await car();
    const { code } = await one(SELLER, "select public.start_vehicle_transfer($1) as code", [v]);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    const claim = async (uid: string, c: string, vin: string) =>
      (await one(uid, "select public.claim_vehicle_transfer($1, $2) as r", [c, vin])).r.status;
    expect(await claim(BUYER, "AAAA-AAAA", VIN)).toBe("code_invalid");
    expect(await claim(SELLER, code, VIN)).toBe("own_car");
    for (let i = 0; i < 5; i++) expect(await claim(BUYER, code, "WRONG")).toBe("vin_mismatch");
    expect(await claim(BUYER, code, VIN)).toBe("code_invalid"); // closed after five wrong VINs
  });

  it("gives the buyer a read-only copy of the record and leaves the seller a read-only sold car", async () => {
    const v = await car();
    const m = await mod(v);
    await mod(v, { name: "Turbo someday", status: "planned" });
    await db.query(
      "insert into public.receipts (owner_id, vehicle_id, mod_id, storage_path, mime, bytes) values ($1, $2, $3, $4, 'image/jpeg', 100)",
      [SELLER, v, m, `${SELLER}/receipts/r.jpg`],
    );
    await q(null, "select public.confirm_by_link($1, 'confirmed', 'Apex Tuning', null, null, null)", [await linkFor("mod", m)]);
    const share = await shareFor(v);
    const { code } = await one(SELLER, "select public.start_vehicle_transfer($1) as code", [v]);

    const r = (await one(BUYER, "select public.claim_vehicle_transfer($1, $2) as r", [code.toLowerCase(), VIN])).r;
    expect(r.status).toBe("ok");
    const mine = await record(r.vehicle_id, BUYER);
    expect(mine.owners).toBe(2);
    expect(mine.entries.map((e: any) => e.title)).toEqual(["Coilovers"]); // plans stay with the seller
    expect(mine.entries[0]).toMatchObject({ earlier_owner: true, confirmation: { shop_name: "Apex Tuning" } });
    expect(mine.entries[0].receipts).toHaveLength(1);
    const copied = await one(BUYER, "select cost_minor, notes, installed_by from public.mods where vehicle_id = $1", [r.vehicle_id]);
    expect(copied).toEqual({ cost_minor: null, notes: null, installed_by: "Apex Tuning" });

    // the buyer can't rewrite or remove the earlier owner's work, but can add their own
    const inherited = mine.entries[0].id;
    await fails(q(BUYER, "update public.mods set name = 'x' where id = $1", [inherited]), /inherited_entry/);
    await fails(q(BUYER, "select public.soft_delete_mod($1)", [inherited]), /inherited_entry/);
    await mod(r.vehicle_id, { name: "Wheels" }, BUYER);

    // the seller's car is now a read-only copy, and the old link stops working
    expect((await record(v)).sold_at).not.toBeNull();
    await fails(mod(v, { name: "After the sale" }), /vehicle_sold/);
    await fails(q(SELLER, "update public.mods set name = 'x' where id = $1", [m]), /vehicle_sold/);
    expect((await one(null, "select public.build_record($1) as r", [share])).r).toBeNull();
    // a sold car doesn't use up the seller's free plan
    await car(SELLER, null);
    await car(SELLER, null);
  });
});
