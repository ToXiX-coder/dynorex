import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** D-63: members' builds on a club page. */
const A = "00000000-0000-4000-8000-000000000ea1";
const B = "00000000-0000-4000-8000-000000000eb1";
const C = "00000000-0000-4000-8000-000000000ec1";
let db: PGlite;

const q = <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) =>
  as(db, uid, async (tx: Transaction) => (await tx.query<T>(sql, params)).rows);
const one = async <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) =>
  (await q<T>(uid, sql, params))[0]!;

async function car(uid: string, visibility: "public" | "private", title: string) {
  const { id } = await one<{ id: string }>(
    uid,
    "insert into public.vehicles (year, make, model, visibility) values (2016, 'Mazda', 'MX-5', $1) returning id",
    [visibility],
  );
  await q(uid, "insert into public.builds (vehicle_id, title, visibility) values ($1, $2, $3)", [id, title, visibility]);
}
const builds = async (uid: string | null, club: string) =>
  (await q<{ title: string }>(uid, "select title from public.club_builds($1)", [club])).map((b) => b.title).sort();

beforeEach(async () => {
  db = await freshDb();
  for (const [id, name] of [
    [A, "inv_a"],
    [B, "inv_b"],
    [C, "inv_c"],
  ] as const) {
    await createAuthUser(db, id, true);
    await setUsername(db, id, name);
  }
});
afterEach(async () => {
  await db.close();
});

describe("members' builds on a club page", () => {
  it("shows members' public builds only, to anyone for a public club and to members for an invite-only one", async () => {
    const { id: club } = await one<{ id: string }>(A, "select public.create_club('Roadster Crew', null) as id");
    await q(B, "select public.join_club($1)", [club]);
    await car(A, "public", "Track Miata");
    await car(B, "public", "Daily Miata");
    await car(B, "private", "Secret Miata");
    await car(C, "public", "Not a member");
    expect(await builds(null, club)).toEqual(["Daily Miata", "Track Miata"]);

    // invite-only: the list would show who belongs, so only members see it
    await q(A, "update public.clubs set visibility = 'private' where id = $1", [club]);
    expect(await builds(null, club)).toEqual([]);
    expect(await builds(C, club)).toEqual([]);
    expect(await builds(B, club)).toEqual(["Daily Miata", "Track Miata"]);
  });
});
