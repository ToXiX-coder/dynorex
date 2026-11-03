import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, as, createAuthUser, dbAtMigration, migrationFiles, setUsername } from "./db";

/**
 * Upgrade path (spec: "all migrations apply from a clean database and from the supported prior version").
 * No version has shipped yet, so every earlier point is treated as a possible prior version: data written
 * at Phase 3 (build core) must survive Phases 4-6 and keep working.
 */
let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

const A = "00000000-0000-4000-8000-0000000000a6";
const B = "00000000-0000-4000-8000-0000000000b6";

describe("migrations", () => {
  it("are uniquely and correctly ordered", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(new Set(files.map((f) => f.slice(0, 14))).size).toBe(files.length);
    for (const f of files) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it("never edit or drop data destructively", () => {
    for (const f of migrationFiles()) {
      const sql = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations", f), "utf8");
      expect(sql, f).not.toMatch(/\bdrop\s+table\b/i);
      expect(sql, f).not.toMatch(/\btruncate\b/i);
      expect(sql, f).not.toMatch(/\bdelete\s+from\s+public\.(users|vehicles|mods|builds)\b/i);
    }
  });

  it("Phase 3 data survives the Phase 4-6 upgrade and works with the new features", async () => {
    const files = migrationFiles();
    const phase3 = files.findIndex((f) => f.includes("phase3")) + 1;
    db = await dbAtMigration(phase3);
    await createAuthUser(db, A, true);
    await createAuthUser(db, B, true);
    await setUsername(db, A, "upgrade_a6");
    await setUsername(db, B, "upgrade_b6");
    // a Phase 3-era public vehicle with a build and a mod
    const v = await as(db, A, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "insert into public.vehicles (year, make, model, baseline_hp, visibility) values (2004, 'Sample', 'Coupe', 200, 'public') returning id",
      );
      const id = r.rows[0]!.id;
      await tx.query("insert into public.builds (vehicle_id, title, visibility) values ($1, 'Old build', 'public')", [
        id,
      ]);
      await tx.query(
        `insert into public.mods (vehicle_id, name, category, status, spec_deltas)
         values ($1, 'Old mod', 'engine', 'complete', '{"schema_version":1,"hp":{"delta":10,"unit":"hp"}}')`,
        [id],
      );
      return id;
    });

    await applyMigrations(db, files.slice(phase3));

    // old data visible through the new public views and features
    expect((await as(db, null, (tx) => tx.query("select title, mods_count from public.public_builds"))).rows).toEqual([
      { title: "Old build", mods_count: 1 },
    ]);
    expect((await as(db, null, (tx) => tx.query("select hp from public.public_build_specs($1)", [v]))).rows).toEqual([
      { hp: "210" },
    ]);
    const build = (await db.query<{ id: string }>("select id from public.builds")).rows[0]!.id;
    await as(db, B, (tx) => tx.query("insert into public.build_follows (build_id) values ($1)", [build]));
    await as(db, A, (tx) =>
      tx.query("insert into public.mods (vehicle_id, name, category) values ($1, 'New mod', 'exhaust')", [v]),
    );
    expect((await as(db, B, (tx) => tx.query("select title from public.notifications"))).rows).toEqual([
      { title: "Build update" },
    ]);
    expect((await as(db, A, (tx) => tx.query("select plus from public.my_subscription()"))).rows).toEqual([
      { plus: false },
    ]);
  });
});
