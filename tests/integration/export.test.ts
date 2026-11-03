import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPORT_EXCLUDED, EXPORT_TABLES } from "../../supabase/functions/_shared/exportTables";
import { as, createAuthUser, freshDb, setUsername } from "./db";

/** "Export my data" must cover every table that holds something about a person. */
let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
});
afterAll(async () => {
  await db.close();
});

describe("data export coverage", () => {
  it("every public table that references a user is exported or excluded with a reason", async () => {
    const { rows } = await db.query<{ ref: string }>(`
      select c.relname || '.' || a.attname as ref
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
      where k.contype = 'f' and n.nspname = 'public' and k.confrelid = 'public.users'::regclass
      order by 1`);
    const covered = new Set(EXPORT_TABLES.filter(([, , c]) => c).map(([, t, c]) => `${t}.${c}`));
    const missing = rows.map((r) => r.ref).filter((ref) => !covered.has(ref) && !(ref in EXPORT_EXCLUDED));
    expect(missing).toEqual([]);
    // and no stale exclusions: each one is a real reference to a user
    const refs = new Set(rows.map((r) => r.ref));
    expect(Object.keys(EXPORT_EXCLUDED).filter((k) => !refs.has(k))).toEqual([]);
  });

  it("names only real tables and columns, and a user can read each of them (as the export does)", async () => {
    const U = "00000000-0000-4000-8000-0000000000e1";
    await createAuthUser(db, U, true);
    await setUsername(db, U, "export_e1");
    const failures: string[] = [];
    for (const [key, table, column, columns] of EXPORT_TABLES) {
      try {
        await as(db, U, (tx) =>
          column
            ? tx.query(`select ${columns ?? "*"} from public.${table} where ${column} = $1 limit 1`, [U])
            : tx.query(`select ${columns ?? "*"} from public.${table} limit 1`),
        );
      } catch (e) {
        failures.push(`${key}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
    // only the caller's own reports come back, even without a filter
    const R = "00000000-0000-4000-8000-0000000000e2";
    await createAuthUser(db, R, true);
    await setUsername(db, R, "export_e2");
    await as(db, R, (tx) =>
      tx.query("insert into public.reports (target_type, target_id, reason) values ('user', $1, 'spam')", [U]),
    );
    const mine = await as(db, U, (tx) => tx.query("select id from public.reports"));
    expect(mine.rows).toEqual([]);
    const theirs = await as(db, R, (tx) => tx.query("select id from public.reports"));
    expect(theirs.rows).toHaveLength(1);
    for (const ref of Object.keys(EXPORT_EXCLUDED)) {
      const [table, column] = ref.split(".");
      const { rows } = await db.query(
        "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2",
        [table, column],
      );
      expect(rows, ref).toHaveLength(1);
    }
  });
});
