import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { as, freshDb } from "./db";

const SEED = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/seed.sql"), "utf8");

describe("seed.sql", () => {
  it("applies cleanly, twice, and the public views hide the private cases", async () => {
    const db = await freshDb();
    await db.exec(SEED);
    await db.exec(SEED); // idempotent
    expect((await db.query("select count(*)::int as n from public.mods")).rows[0]).toEqual({ n: 4 });
    const builds = await as(db, null, (tx) =>
      tx.query<{ title: string }>("select title from public.public_builds order by title"),
    );
    expect(builds.rows.map((r) => r.title)).toEqual(["Classic restomod", "Coupe track prep"]);
    const pub = JSON.stringify((await as(db, null, (tx) => tx.query("select * from public.public_vehicles"))).rows);
    expect(pub).not.toContain("SAMPLEVXN");
    // Phase 4-6 scenarios: one current member, one lapsed, badge computed from verified state
    const badges = await as(db, null, (tx) =>
      tx.query("select username, plus_member from public.public_profiles order by username"),
    );
    expect(badges.rows).toEqual([
      { username: "sample_restomod", plus_member: false },
      { username: "sample_track_rat", plus_member: true },
    ]);
    expect(
      (await as(db, null, (tx) => tx.query("select sticker, reactions from public.public_build_reactions"))).rows,
    ).toEqual([{ sticker: "hype", reactions: 1 }]);
  });
});
