import fs from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

/**
 * Runs the real migrations on PGlite (Postgres compiled to WASM) with a minimal stand-in for the
 * parts of Supabase the migrations rely on: the anon/authenticated/service_role roles, an
 * auth.users table, and auth.uid() reading the JWT subject. This is NOT a full Supabase stack.
 * CI also applies the same migrations to a real local Supabase (see .github/workflows/ci.yml).
 */
const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- minimal stand-in for Supabase Storage (buckets, objects, foldername)
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid default auth.uid(), created_at timestamptz default now(), unique (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, delete on storage.objects to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
`;

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../supabase/migrations");

let template: Blob | File | undefined;

/**
 * A fresh database with every migration applied. Migrations run once per worker; each call then
 * loads a copy of that data directory, which is much faster and lighter than re-running them.
 * Callers should close() the database when done.
 */
export async function freshDb(): Promise<PGlite> {
  if (!template) {
    const db = await PGlite.create();
    await db.exec(SUPABASE_SHIM);
    for (const file of fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    }
    template = await db.dumpDataDir();
    await db.close();
  }
  return PGlite.create({ loadDataDir: template });
}
export const migrationFiles = () =>
  fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

/** A database with only some migrations applied (for upgrade tests); apply the rest with applyMigrations. */
export async function dbAtMigration(count: number): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_SHIM);
  await applyMigrations(db, migrationFiles().slice(0, count));
  return db;
}
export async function applyMigrations(db: PGlite, files: string[]) {
  for (const file of files) await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
}

/** Grant Dynorex+-equivalent limits (staff/tester override), as the service role would. */
export async function grantPlus(db: PGlite, uid: string) {
  await db.query(
    "insert into app_private.plan_overrides (user_id, reason) values ($1, 'test') on conflict do nothing",
    [uid],
  );
}

export async function createAuthUser(db: PGlite, id: string, verified: boolean) {
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)", [
    id,
    `${id.slice(0, 8)}@example.test`,
    verified ? new Date().toISOString() : null,
  ]);
}

/** Pick a username exactly as the app does: an UPDATE on your own (trigger-created) profile row. */
export async function setUsername(db: PGlite, uid: string, username: string) {
  await as(db, uid, (tx) => tx.query("update public.users set username = $1 where id = $2", [username, uid]));
}

/** Run queries as a signed-in user (or anon when uid is null), exactly as PostgREST would. */
export async function as<T>(db: PGlite, uid: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    return fn(tx);
  });
}

export const ids = {
  alice: "00000000-0000-4000-8000-00000000000a",
  bob: "00000000-0000-4000-8000-00000000000b",
  carol: "00000000-0000-4000-8000-00000000000c",
};
