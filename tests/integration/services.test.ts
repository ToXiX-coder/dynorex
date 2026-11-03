import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** Services (D-57): business pages, service menus, quote/booking requests and the request chat. No payments. */
const SHOP = "00000000-0000-4000-8000-0000000006a1";
const CUST = "00000000-0000-4000-8000-0000000006b1";
const OTHER = "00000000-0000-4000-8000-0000000006c1";
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
const business = async (uid = SHOP, name = "Sample Speed Shop") =>
  (
    await q<{ id: string }>(
      uid,
      `insert into public.businesses (name, location_text, website, specialties)
       values ($1, 'Sample City', 'https://sample-speed.example', '{engine,suspension}') returning id`,
      [name],
    )
  )[0]!.id;
const service = async (biz: string, name = "Dyno tune", priceType = "from", price: number | null = 45000) =>
  (
    await q<{ id: string }>(
      SHOP,
      `insert into public.business_services (business_id, name, category, price_type, price_minor)
       values ($1, $2, 'engine', $3, $4) returning id`,
      [biz, name, priceType, price],
    )
  )[0]!.id;
const request = async (svc: string, uid = CUST) =>
  (
    await q<{ id: string }>(
      uid,
      "select public.request_service($1, '2015 Subaru WRX', current_date + 7, 'Stage 1 tune, stock turbo') as id",
      [svc],
    )
  )[0]!.id;

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [SHOP, "speed_shop"],
    [CUST, "svc_customer"],
    [OTHER, "svc_other"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("Services: business pages", () => {
  it("anyone can browse; one page per account; badge and counts are server-side", async () => {
    const biz = await business();
    await service(biz);
    await service(biz, "Alignment", "fixed", 12000);
    await service(biz, "Custom fabrication", "quote", null);
    expect(
      await q(
        null,
        "select name, owner_username, verified, services_count, jobs_completed from public.public_businesses",
      ),
    ).toEqual([
      {
        name: "Sample Speed Shop",
        owner_username: "speed_shop",
        verified: false,
        services_count: 3,
        jobs_completed: 0,
      },
    ]);
    expect(
      await q(null, "select name, price_type, price_minor from public.public_business_services order by name"),
    ).toEqual([
      { name: "Alignment", price_type: "fixed", price_minor: 12000 },
      { name: "Custom fabrication", price_type: "quote", price_minor: null },
      { name: "Dyno tune", price_type: "from", price_minor: 45000 },
    ]);
    expect(
      await fails(SHOP, "insert into public.businesses (name, location_text) values ('Second Shop', 'Sample City')"),
    ).toMatch(/duplicate key/);
    expect(
      await fails(OTHER, "insert into public.businesses (name, location_text) values ('sample speed shop', 'X City')"),
    ).toMatch(/duplicate key/);
    // the staff badge isn't client-writable
    expect(await fails(SHOP, "update public.users set business_badge = true where id = $1", [SHOP])).toMatch(
      /permission denied/,
    );
  });

  it("rejects bad contact details and prices that don't match the price type", async () => {
    expect(
      await fails(
        SHOP,
        "insert into public.businesses (name, location_text, website) values ('Shop A', 'X City', 'http://plain.example')",
      ),
    ).toMatch(/check/);
    expect(
      await fails(
        SHOP,
        "insert into public.businesses (name, location_text, phone) values ('Shop B', 'X City', 'call me')",
      ),
    ).toMatch(/check/);
    const biz = await business();
    expect(
      await fails(
        SHOP,
        "insert into public.business_services (business_id, name, category, price_type) values ($1, 'Tune', 'engine', 'fixed')",
        [biz],
      ),
    ).toMatch(/check/);
    expect(
      await fails(
        SHOP,
        "insert into public.business_services (business_id, name, category, price_type, price_minor) values ($1, 'Tune', 'engine', 'quote', 100)",
        [biz],
      ),
    ).toMatch(/check/);
  });

  it("services only go on your own page", async () => {
    const biz = await business();
    expect(
      await fails(
        OTHER,
        "insert into public.business_services (business_id, name, category) values ($1, 'Fake service', 'engine')",
        [biz],
      ),
    ).toMatch(/not_found/);
  });
});

describe("Services: requests", () => {
  it("request, accept, chat, complete; the shop is told and the customer is told", async () => {
    const biz = await business();
    const svc = await service(biz);
    expect(await fails(SHOP, "select public.request_service($1, null, null, 'hi')", [svc])).toMatch(/own_business/);
    const r = await request(svc);
    expect(await fails(CUST, "select public.request_service($1, null, null, 'again')", [svc])).toMatch(
      /request_exists/,
    );
    expect(await fails(CUST, "select public.request_service($1, null, current_date - 1, 'past')", [svc])).toMatch(
      /invalid_date|request_exists/,
    );

    expect(
      await q(SHOP, "select service_name, customer_username, vehicle_text, status from public.business_requests()"),
    ).toEqual([
      { service_name: "Dyno tune", customer_username: "svc_customer", vehicle_text: "2015 Subaru WRX", status: "open" },
    ]);
    expect(await q(OTHER, "select * from public.business_requests()")).toEqual([]);
    expect(await q(OTHER, "select * from public.service_request($1)", [r])).toEqual([]);
    expect((await q<{ role: string }>(SHOP, "select role from public.service_request($1)", [r]))[0]!.role).toBe(
      "business",
    );

    // customers can't accept their own request; shops can't skip straight to done
    expect(await fails(CUST, "select public.set_request_status($1, 'accepted')", [r])).toMatch(/request_closed/);
    expect(await fails(SHOP, "select public.set_request_status($1, 'completed')", [r])).toMatch(/request_closed/);
    await q(SHOP, "select public.set_request_status($1, 'accepted')", [r]);

    await q(CUST, "select public.send_request_message($1, 'Can I drop it off Friday?')", [r]);
    await q(SHOP, "select public.send_request_message($1, 'Friday 9am works.')", [r]);
    expect(await q(CUST, "select mine, body from public.request_thread($1)", [r])).toEqual([
      { mine: true, body: "Can I drop it off Friday?" },
      { mine: false, body: "Friday 9am works." },
    ]);
    expect(await q(OTHER, "select * from public.request_thread($1)", [r])).toEqual([]);
    expect(await fails(OTHER, "select public.send_request_message($1, 'hi')", [r])).toMatch(/not_found/);

    await q(SHOP, "select public.set_request_status($1, 'completed')", [r]);
    expect(await fails(CUST, "select public.send_request_message($1, 'thanks')", [r])).toMatch(/request_closed/);
    expect(
      (await q<{ jobs_completed: number }>(null, "select jobs_completed from public.public_businesses"))[0]!
        .jobs_completed,
    ).toBe(1);
    const notes = (
      await db.query<{ recipient_id: string; category: string }>(
        "select recipient_id, category from public.notifications order by created_at",
      )
    ).rows;
    expect(notes).toEqual([
      { recipient_id: SHOP, category: "service_request_received" },
      { recipient_id: CUST, category: "service_request_update" },
      { recipient_id: CUST, category: "service_request_update" },
    ]);
  });

  it("customers can cancel; requests can't be written directly; blocks hide the shop", async () => {
    const biz = await business();
    const svc = await service(biz);
    const r = await request(svc);
    await q(CUST, "select public.set_request_status($1, 'cancelled')", [r]);
    expect(await q(CUST, "select status from public.my_service_requests()")).toEqual([{ status: "cancelled" }]);
    expect(
      await fails(
        CUST,
        "insert into public.service_requests (business_id, customer_id, message) values ($1, $2, 'x')",
        [biz, CUST],
      ),
    ).toMatch(/permission denied/);
    await q(SHOP, "insert into public.blocks (blocked_id) values ($1)", [OTHER]);
    expect(await q(OTHER, "select * from public.public_businesses")).toEqual([]);
    expect(await fails(OTHER, "select public.request_service($1, null, null, 'hi')", [svc])).toMatch(/not_found/);
  });

  it("deleting the business closes live requests; moderators can hide a business", async () => {
    const MOD = "00000000-0000-4000-8000-0000000006d1";
    await createAuthUser(db, MOD, true);
    await db.query("insert into app_private.moderators (user_id) values ($1)", [MOD]);
    const biz = await business();
    await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("select public.moderate_business($1, $2, true, null, 'spam')", [MOD, biz]);
    });
    expect(await q(null, "select * from public.public_businesses")).toEqual([]);
    await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("select public.moderate_business($1, $2, false, null, 'ok')", [MOD, biz]);
    });
    const svc = await service(biz);
    const r = await request(svc);
    await q(SHOP, "select public.soft_delete_business($1)", [biz]);
    expect(await q(CUST, "select status from public.my_service_requests()")).toEqual([{ status: "cancelled" }]);
    expect(await q(null, "select * from public.public_business_services")).toEqual([]);
    void r;
  });
});
