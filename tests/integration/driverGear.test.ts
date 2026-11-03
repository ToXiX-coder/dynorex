import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** Driver gear: owners dress their own driver, the database only accepts known items, and it's public. */
let db: PGlite;
const A = "00000000-0000-4000-8000-0000000008a1";
const B = "00000000-0000-4000-8000-0000000008b2";
const q = <T = Record<string, unknown>>(u: string | null, sql: string, params: unknown[] = []) =>
  as(db, u, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
const fails = async (u: string | null, sql: string, params: unknown[] = []) => {
  try {
    await q(u, sql, params);
    return "ok";
  } catch (e) {
    return String((e as Error).message);
  }
};

beforeEach(async () => {
  db = await freshDb();
  await createAuthUser(db, A, true);
  await setUsername(db, A, "helmet_hero");
  await createAuthUser(db, B, true);
  await setUsername(db, B, "other_driver");
});
afterEach(async () => {
  await db.close();
});

describe("driver gear", () => {
  it("owners save a known kit (or null for 'dress me for my goal'); junk is refused", async () => {
    await q(
      A,
      "update public.users set driver_gear = 'race_helmet:mechanic_jacket:wrench', build_goal = 'track_build' where id = $1",
      [A],
    );
    expect(await fails(A, "update public.users set driver_gear = 'tiara:race_suit:flag' where id = $1", [A])).toMatch(
      /check/,
    );
    expect(await fails(A, "update public.users set driver_gear = 'cap:hoodie' where id = $1", [A])).toMatch(/check/);
    await q(A, "update public.users set driver_gear = null where id = $1", [A]);
    await q(A, "update public.users set driver_gear = 'shades:tee:trophy' where id = $1", [A]);

    // shown on the public profile, to signed-out visitors too
    expect(
      await q(null, "select driver_gear, build_goal from public.public_profiles where username = 'helmet_hero'"),
    ).toEqual([{ driver_gear: "shades:tee:trophy", build_goal: "track_build" }]);
  });

  it("nobody can dress someone else's driver", async () => {
    await q(B, "update public.users set driver_gear = 'beanie:flannel:wrench' where id = $1", [A]);
    expect(await q(A, "select driver_gear from public.users where id = $1", [A])).toEqual([{ driver_gear: null }]);
  });
});
