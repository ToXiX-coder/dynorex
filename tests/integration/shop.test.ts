import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, grantPlus, setUsername } from "./db";

/** The Shop (D-56): listings, offers and the buyer/seller thread. No payments. */
const S = "00000000-0000-4000-8000-0000000005a1"; // seller
const B = "00000000-0000-4000-8000-0000000005b1"; // buyer
const C = "00000000-0000-4000-8000-0000000005c1"; // another buyer
const X = "00000000-0000-4000-8000-0000000005d1"; // outsider
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
const list = async (uid = S, title = "Sample cat-back exhaust", price = 45000) =>
  (
    await q<{ id: string }>(
      uid,
      `insert into public.listings (title, category, condition, price_minor, location_text, fits)
       values ($1, 'exhaust', 'used', $2, 'Sample City', '2015-2021 WRX') returning id`,
      [title, price],
    )
  )[0]!.id;
const offer = async (uid: string, listing: string, amount = 40000, note: string | null = "Can pick up Saturday") =>
  (await q<{ id: string }>(uid, "select public.make_offer($1, $2, $3) as id", [listing, amount, note]))[0]!.id;
const status = async (listing: string) =>
  (await db.query<{ status: string }>("select status from public.listings where id = $1", [listing])).rows[0]!.status;
const notes = async (uid: string) =>
  (
    await db.query<{ category: string; body: string }>(
      "select category, body from public.notifications where recipient_id = $1 order by created_at",
      [uid],
    )
  ).rows;

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [S, "shop_seller"],
    [B, "shop_buyer"],
    [C, "shop_buyer2"],
    [X, "shop_outsider"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("Shop: listings", () => {
  it("anyone can browse; only the seller writes; status and photo aren't client-writable", async () => {
    const id = await list();
    expect(
      await q(
        null,
        "select seller_username, title, price_minor, has_photo, status, boosted from public.public_listings",
      ),
    ).toEqual([
      {
        seller_username: "shop_seller",
        title: "Sample cat-back exhaust",
        price_minor: 45000,
        has_photo: false,
        status: "active",
        boosted: false,
      },
    ]);
    // the raw table is private to the seller
    expect(await q(B, "select id from public.listings")).toEqual([]);
    await q(S, "update public.listings set price_minor = 42000 where id = $1", [id]);
    await q(B, "update public.listings set price_minor = 1 where id = $1", [id]); // RLS: no rows touched
    expect(
      (await q<{ price_minor: number }>(null, "select price_minor from public.public_listings"))[0]!.price_minor,
    ).toBe(42000);
    expect(await fails(S, "update public.listings set status = 'sold' where id = $1", [id])).toMatch(
      /permission denied/,
    );
    expect(await fails(S, "update public.listings set photo_path = 'x/y.jpg' where id = $1", [id])).toMatch(
      /permission denied/,
    );
    expect(await fails(S, "update public.listings set seller_id = $2 where id = $1", [id, B])).toMatch(
      /permission denied/,
    );
  });

  it("free sellers keep 5 up at once, Dynorex+ 25; sold ones don't count; Plus listings are boosted", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await list(S, `Sample part number ${i}`));
    expect(
      await fails(
        S,
        "insert into public.listings (title, category, condition, price_minor, location_text) values ('One more part', 'engine', 'new', 100, 'Sample City')",
      ),
    ).toMatch(/plan_limit_listings/);
    await q(S, "select public.set_listing_status($1, 'sold')", [ids[0]]);
    await list(S, "Room for this one");
    // relisting the sold one would make 6: refused like a new listing
    expect(await fails(S, "select public.set_listing_status($1, 'active')", [ids[0]])).toMatch(/plan_limit_listings/);
    await grantPlus(db, C);
    await list(C, "Boosted sample part");
    expect(await q(null, "select boosted from public.public_listings where title = 'Boosted sample part'")).toEqual([
      { boosted: true },
    ]);
  });

  it("blocked and muted sellers disappear; deleted and hidden listings too", async () => {
    const id = await list();
    await q(B, "insert into public.mutes (muted_id) values ($1)", [S]);
    expect(await q(B, "select listing_id from public.public_listings")).toEqual([]);
    expect(await q(C, "select listing_id from public.public_listings")).toHaveLength(1);
    await q(S, "insert into public.blocks (blocked_id) values ($1)", [C]);
    expect(await q(C, "select listing_id from public.public_listings")).toEqual([]);
    expect(await fails(C, "select public.make_offer($1, 100, null)", [id])).toMatch(/not_found/);
    await q(S, "select public.soft_delete_listing($1)", [id]);
    expect(await q(null, "select listing_id from public.public_listings")).toEqual([]);
  });
});

describe("Shop: offers", () => {
  it("offer, accept, the rest are declined, listing held; buyer told; no offers on your own listing", async () => {
    const id = await list();
    expect(await fails(S, "select public.make_offer($1, 100, null)", [id])).toMatch(/own_listing/);
    const o1 = await offer(B, id);
    const o2 = await offer(C, id, 38000, null);
    expect(await fails(B, "select public.make_offer($1, 41000, null)", [id])).toMatch(/offer_exists/);
    expect(await notes(S)).toEqual([
      { category: "marketplace_offer_received", body: "@shop_buyer offered $400 for Sample cat-back exhaust." },
      { category: "marketplace_offer_received", body: "@shop_buyer2 offered $380 for Sample cat-back exhaust." },
    ]);
    // only the seller sees who offered; buyers see only their own offers
    expect(
      await q(S, "select buyer_username, amount_minor, status from public.listing_offers_for($1)", [id]),
    ).toHaveLength(2);
    expect(await q(B, "select * from public.listing_offers_for($1)", [id])).toEqual([]);
    expect(await q(B, "select id from public.listing_offers")).toEqual([{ id: o1 }]);
    expect(await fails(B, "select public.respond_offer($1, true)", [o1])).toMatch(/not_found/);

    await q(S, "select public.respond_offer($1, true)", [o1]);
    expect(await status(id)).toBe("pending");
    expect(await q(C, "select status from public.my_offers()")).toEqual([{ status: "declined" }]);
    expect(await fails(S, "select public.respond_offer($1, true)", [o2])).toMatch(/offer_closed/);
    expect(await fails(X, "select public.make_offer($1, 100, null)", [id])).toMatch(/listing_unavailable/);
    expect((await notes(B)).map((n) => n.category)).toEqual(["marketplace_offer_accepted"]);

    await q(S, "select public.set_listing_status($1, 'sold')", [id]);
    expect(await status(id)).toBe("sold");
    expect((await notes(B)).map((n) => n.category)).toEqual([
      "marketplace_offer_accepted",
      "marketplace_sale_complete",
    ]);
    expect(await q(null, "select status from public.public_listings")).toEqual([{ status: "sold" }]);
  });

  it("withdrawing an accepted offer relists; relisting releases the accepted buyer", async () => {
    const id = await list();
    const o1 = await offer(B, id);
    await q(S, "select public.respond_offer($1, true)", [o1]);
    await q(B, "select public.withdraw_offer($1)", [o1]);
    expect(await status(id)).toBe("active");
    const o2 = await offer(C, id);
    await q(S, "select public.respond_offer($1, true)", [o2]);
    await q(S, "select public.set_listing_status($1, 'active')", [id]);
    expect(await status(id)).toBe("active");
    expect(await q(C, "select status from public.my_offers()")).toEqual([{ status: "declined" }]);
    expect(await fails(S, "select public.set_listing_status($1, 'pending')", [id])).toMatch(/accept_an_offer/);
  });

  it("offers can't be written directly", async () => {
    const id = await list();
    expect(await fails(B, "insert into public.listing_offers (listing_id, amount_minor) values ($1, 1)", [id])).toMatch(
      /permission denied/,
    );
    const o = await offer(B, id);
    expect(await fails(B, "update public.listing_offers set status = 'accepted' where id = $1", [o])).toMatch(
      /permission denied/,
    );
  });
});

describe("Shop: offer chat", () => {
  it("only the buyer and seller read and write; closes with the offer", async () => {
    const id = await list();
    const o = await offer(B, id);
    await q(B, "select public.send_offer_message($1, 'Is the hanger included?')", [o]);
    await q(S, "select public.send_offer_message($1, 'Yes, and the gaskets.')", [o]);
    expect(await q(S, "select mine, sender_username, body from public.offer_thread($1)", [o])).toEqual([
      { mine: false, sender_username: "shop_buyer", body: "Is the hanger included?" },
      { mine: true, sender_username: "shop_seller", body: "Yes, and the gaskets." },
    ]);
    expect(await q(X, "select * from public.offer_thread($1)", [o])).toEqual([]);
    expect(await fails(X, "select public.send_offer_message($1, 'hi')", [o])).toMatch(/not_found/);
    expect(
      await fails(B, "insert into public.listing_messages (offer_id, sender_id, body) values ($1, $2, 'x')", [o, B]),
    ).toMatch(/permission denied/);
    await q(S, "select public.respond_offer($1, false)", [o]);
    expect(await fails(B, "select public.send_offer_message($1, 'Please?')", [o])).toMatch(/offer_closed/);
    // a block ends the conversation
    const o2 = await offer(C, id);
    await q(C, "insert into public.blocks (blocked_id) values ($1)", [S]);
    expect(await fails(S, "select public.send_offer_message($1, 'Still want it?')", [o2])).toMatch(/not_found/);
  });
});

describe("Shop: moderation", () => {
  it("moderators can hide and restore a listing", async () => {
    const MOD = "00000000-0000-4000-8000-0000000005e1";
    await createAuthUser(db, MOD, true);
    await db.query("insert into app_private.moderators (user_id) values ($1)", [MOD]);
    const id = await list();
    await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("select public.apply_moderation($1, 'hide_content', 'listing', $2, null, 'scam')", [MOD, id]);
    });
    expect(await q(null, "select listing_id from public.public_listings")).toEqual([]);
  });
});
