import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createUser, freshDb } from "./db";

const SELLER = "00000000-0000-4000-8000-0000000000a1";
const BUYER = "00000000-0000-4000-8000-0000000000b1";
const STRANGER = "00000000-0000-4000-8000-0000000000c1";
const VIN = "JF1VA1C60G9812345";
let db: PGlite;

const q = <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) =>
  as(db, uid, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
const one = async <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) =>
  (await q<T>(uid, sql, params))[0]!;
const fails = (p: Promise<unknown>, msg: RegExp | string) => expect(p).rejects.toThrow(msg);

async function car(uid = SELLER, vin: string | null = VIN) {
  return (await one<{ id: string }>(
    uid,
    "insert into public.cars (year, make, model, trim_level, vin) values (2016, 'Subaru', 'WRX', 'Premium', $1) returning id",
    [vin],
  )).id;
}
type E = { kind?: string; category?: string; compliance?: string; carb_eo?: string | null; installer?: "owner" | "shop" };
async function entry(carId: string, e: E = {}, uid = SELLER) {
  const shop = (e.installer ?? "shop") === "shop";
  return (await one<{ id: string }>(
    uid,
    `insert into public.entries (car_id, kind, category, title, part_brand, compliance, carb_eo, installer_type,
       installer_name, performed_on, odometer, cost_cents, notes)
     values ($1, $2, $3, 'Coilovers', 'KW', $4, $5, $6, $7, '2025-03-01', 41000, 250000, 'garage code 4411')
     returning id`,
    [carId, e.kind ?? "install", e.category ?? "suspension", e.compliance ?? "not_emissions_related", e.carb_eo ?? null,
      shop ? "shop" : "owner", shop ? "Apex Tuning" : null],
  )).id;
}
const confirmLink = async (entryId: string) =>
  (await one<{ t: string }>(SELLER, "select public.request_confirmation($1) as t", [entryId])).t;
const shareLink = async (carId: string) =>
  (await one<{ t: string }>(SELLER, "select public.create_share_link($1) as t", [carId])).t;
const publicRecord = async (token: string) =>
  (await one<{ r: Record<string, any> | null }>(null, "select public.public_record($1) as r", [token])).r;

beforeEach(async () => {
  db = await freshDb();
  for (const id of [SELLER, BUYER, STRANGER]) await createUser(db, id);
});
afterEach(async () => {
  await db.close();
});

describe("privacy", () => {
  it("keeps cars and entries to their owner, and never shows the VIN in a plain read", async () => {
    const c = await car();
    await entry(c);
    expect(await q(STRANGER, "select id from public.cars")).toEqual([]);
    expect(await q(STRANGER, "select id from public.entries")).toEqual([]);
    await fails(q(null, "select id from public.entries"), /permission denied/);
    await fails(q(SELLER, "select vin from public.cars"), /permission denied/);
    expect((await one<{ vin: string }>(SELLER, "select vin from public.my_cars()")).vin).toBe(VIN);
  });
});

describe("append-only entries", () => {
  it("can't be updated or deleted directly", async () => {
    const e = await entry(await car());
    await fails(q(SELLER, "update public.entries set title = 'x' where id = $1", [e]), /permission denied/);
    await fails(q(SELLER, "delete from public.entries where id = $1", [e]), /permission denied/);
  });

  it("keeps the old version on every edit and refuses empty or unknown edits", async () => {
    const e = await entry(await car());
    const rev = await one<{ r: number }>(SELLER, "select public.revise_entry($1, $2, 'Wrong mileage') as r", [
      e,
      { odometer: 41500, part_number: "35220089" },
    ]);
    expect(rev.r).toBe(2);
    const v = await one<{ rev: number; changed: string[]; snapshot: { odometer: number } }>(
      SELLER,
      "select rev, changed, snapshot from public.entry_revisions where entry_id = $1",
      [e],
    );
    expect(v).toMatchObject({ rev: 1, snapshot: { odometer: 41000 } });
    expect(v.changed.sort()).toEqual(["odometer", "part_number"]);
    await fails(q(SELLER, "select public.revise_entry($1, $2, 'same')", [e, { odometer: 41500 }]), /no_change/);
    await fails(q(SELLER, "select public.revise_entry($1, $2, 'sneaky')", [e, { rev: 1 }]), /bad_field/);
    await fails(q(SELLER, "select public.revise_entry($1, $2, '')", [e, { odometer: 1 }]), /reason_required/);
    await fails(q(STRANGER, "select public.revise_entry($1, $2, 'x')", [e, { odometer: 1 }]), /not_owner/);
  });

  it("withdraws instead of deleting, and refuses dates in the future", async () => {
    const c = await car();
    const e = await entry(c);
    await q(SELLER, "select public.withdraw_entry($1, 'Logged on the wrong car')", [e]);
    const r = await publicRecord(await shareLink(c));
    expect(r!.entries[0]).toMatchObject({ withdraw_reason: "Logged on the wrong car" });
    await fails(
      q(SELLER, "select public.revise_entry($1, $2, 'x')", [e, { odometer: 1 }]),
      /withdrawn/,
    );
    await fails(
      q(SELLER, "select public.revise_entry($1, $2, 'x')", [await entry(c), { performed_on: "2999-01-01" }]),
      /future_date/,
    );
  });

  it("matches compliance to the category", async () => {
    const c = await car();
    await fails(entry(c, { category: "suspension", compliance: "unknown" }), /entries_compliance_fits/);
    await fails(entry(c, { category: "exhaust", compliance: "not_emissions_related" }), /entries_compliance_fits/);
    await fails(entry(c, { category: "exhaust", compliance: "carb_eo" }), /entries_eo_needs_number/);
    await fails(entry(c, { category: "exhaust", compliance: "carb_eo", carb_eo: "D-12" }), /carb_eo_check/);
  });
});

describe("shop confirmation", () => {
  it("is never requested for emissions work without a CARB EO, or for owner work", async () => {
    const c = await car();
    await fails(confirmLink(await entry(c, { category: "tune", compliance: "unknown" })), /emissions/);
    await fails(confirmLink(await entry(c, { category: "exhaust", compliance: "off_road_only" })), /emissions/);
    await fails(confirmLink(await entry(c, { installer: "owner" })), /not_shop/);
    expect(await confirmLink(await entry(c, { category: "intake", compliance: "carb_eo", carb_eo: "D-142-44" }))).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(await confirmLink(await entry(c, { kind: "return_to_stock", category: "tune", compliance: "unknown" }))).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("shows the shop the job but not the owner, VIN or cost, and works once", async () => {
    const c = await car();
    const e = await entry(c);
    const token = await confirmLink(e);
    expect(await confirmLink(e)).toBe(token); // re-copying gives the same open link
    const view = (await one<{ v: Record<string, any> }>(null, "select public.shop_view($1) as v", [token])).v;
    expect(view.status).toBe("open");
    const text = JSON.stringify(view);
    for (const secret of [VIN, SELLER, "250000", "garage code"]) expect(text).not.toContain(secret);

    const confirm = (t: string) =>
      one<{ s: string }>(null, "select public.confirm_install($1, 'confirmed', 'Apex Tuning', 'Denver', 41010, null) as s", [t]);
    expect((await confirm(token)).s).toBe("ok");
    expect((await confirm(token)).s).toBe("closed");
    expect((await confirm("f".repeat(64))).s).toBe("not_found");
    await fails(confirmLink(e), /already_confirmed/);
  });

  it("won't confirm an entry that changed after the link was sent, and shows when it changed after confirming", async () => {
    const c = await car();
    const e = await entry(c);
    const token = await confirmLink(e);
    await q(SELLER, "select public.revise_entry($1, $2, 'Brand')", [e, { part_brand: "Bilstein" }]);
    expect((await one<{ s: string }>(null, "select public.confirm_install($1, 'confirmed', 'Apex', null, null, null) as s", [token])).s).toBe(
      "changed",
    );
    const t2 = await confirmLink(e);
    expect(t2).not.toBe(token);
    await q(null, "select public.confirm_install($1, 'confirmed', 'Apex', null, null, null)", [t2]);
    await q(SELLER, "select public.revise_entry($1, $2, 'Mileage')", [e, { odometer: 41100 }]);
    const r = await publicRecord(await shareLink(c));
    expect(r!.entries[0].confirmation.rev).toBe(2);
    expect(r!.entries[0].rev).toBe(3);
  });
});

describe("the buyer's link", () => {
  it("shows the record without the VIN, cost or notes, and stops working when revoked", async () => {
    const c = await car();
    await entry(c);
    const token = await shareLink(c);
    const r = await publicRecord(token);
    expect(r!.car).toEqual({ year: 2016, make: "Subaru", model: "WRX", trim: "Premium" });
    const text = JSON.stringify(r);
    for (const secret of [VIN, SELLER, "250000", "garage code"]) expect(text).not.toContain(secret);
    await q(SELLER, "select public.revoke_share_link($1)", [c]);
    expect(await publicRecord(token)).toBeNull();
  });

  it("answers only match or no match for a VIN, ten times an hour", async () => {
    const c = await car();
    const token = await shareLink(c);
    const check = async (v: string) => (await one<{ s: string }>(null, "select public.check_vin($1, $2) as s", [token, v])).s;
    expect(await check("jf1va1c60g9812345")).toBe("match");
    expect(await check("JF1 VA1C60G98 12346")).toBe("no_match");
    for (let i = 0; i < 8; i++) await check("X");
    expect(await check(VIN)).toBe("too_many");
  });
});

describe("receipts", () => {
  it("registers only files the owner uploaded, and logs a removal", async () => {
    const c = await car();
    const e = await entry(c);
    const path = `${SELLER}/${e}/r1.jpg`;
    const add = (uid: string, p: string) =>
      q(uid, "select public.add_receipt($1, 'receipt', $2, $3, 1000)", [e, p, "a".repeat(64)]);
    await fails(add(SELLER, path), /file_missing/);
    await q(SELLER, "insert into storage.objects (bucket_id, name) values ('receipts', $1)", [path]);
    await fails(q(STRANGER, "insert into storage.objects (bucket_id, name) values ('receipts', $1)", [`${SELLER}/x.jpg`]), /row-level security/);
    await add(SELLER, path);
    const token = await shareLink(c);
    expect((await publicRecord(token))!.entries[0].receipts).toHaveLength(1);

    const { id } = await one<{ id: string }>(SELLER, "select id from public.receipts where entry_id = $1", [e]);
    await q(SELLER, "select public.remove_receipt($1)", [id]);
    const after = (await publicRecord(token))!.entries[0];
    expect(after.receipts).toEqual([]);
    expect(after.revisions[0].reason).toMatch(/^Removed a receipt uploaded \d{4}-\d{2}-\d{2}$/);
  });
});

describe("transfer to the buyer", () => {
  it("needs a VIN on record, and the code plus the VIN off the car", async () => {
    await fails(q(SELLER, "select public.start_transfer($1)", [await car(SELLER, null)]), /vin_required/);
    const c = await car();
    const { code } = await one<{ code: string }>(SELLER, "select public.start_transfer($1) as code", [c]);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    const claim = async (uid: string, codeIn: string, vin: string) =>
      (await one<{ r: { status: string } }>(uid, "select public.claim_transfer($1, $2) as r", [codeIn, vin])).r.status;
    expect(await claim(BUYER, "AAAA-AAAA", VIN)).toBe("code_invalid");
    expect(await claim(SELLER, code, VIN)).toBe("own_car");
    for (let i = 0; i < 4; i++) expect(await claim(BUYER, code, "WRONGVIN")).toBe("vin_mismatch");
    expect(await claim(BUYER, code, "WRONGVIN")).toBe("vin_mismatch");
    expect(await claim(BUYER, code, VIN)).toBe("code_invalid"); // closed after 5 wrong VINs
  });

  it("moves the record, keeps the seller's read-only copy of their era, and resets the links", async () => {
    const c = await car();
    const sellersEntry = await entry(c);
    const share = await shareLink(c);
    const { code } = await one<{ code: string }>(SELLER, "select public.start_transfer($1) as code", [c]);
    const r = await one<{ r: { status: string; car_id: string } }>(BUYER, "select public.claim_transfer($1, $2) as r", [
      code.toLowerCase().replace("-", " - "),
      VIN,
    ]);
    expect(r.r).toEqual({ status: "ok", car_id: c });

    const buyersEntry = await entry(c, {}, BUYER);
    const seen = async (uid: string) => (await q<{ id: string }>(uid, "select id from public.entries order by created_at")).map((x) => x.id);
    expect(await seen(BUYER)).toEqual([sellersEntry, buyersEntry]);
    expect(await seen(SELLER)).toEqual([sellersEntry]);
    expect(await one(SELLER, "select archived, vin from public.my_cars()")).toEqual({ archived: true, vin: null });

    await fails(entry(c, {}, SELLER), /row-level security/);
    await fails(q(SELLER, "select public.revise_entry($1, $2, 'x')", [sellersEntry, { odometer: 1 }]), /not_owner/);
    expect(await publicRecord(share)).toBeNull();
    const fresh = (await one<{ t: string }>(BUYER, "select public.create_share_link($1) as t", [c])).t;
    expect((await publicRecord(fresh))!.owners).toBe(2);
    await fails(q(BUYER, "select public.delete_car($1)", [c]), /has_history/);
  });
});
