import fs from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

/**
 * Runs the real migrations on PGlite (Postgres in WASM) with a minimal stand-in for the parts of Supabase they
 * use: the anon/authenticated roles, auth.users, auth.uid() and a sliver of Storage. Not a full Supabase stack.
 */
const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
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

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../supabase/migrations");
let template: Blob | File | undefined;

export async function freshDb(): Promise<PGlite> {
  if (!template) {
    const db = await PGlite.create();
    await db.exec(SUPABASE_SHIM);
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    template = await db.dumpDataDir();
    await db.close();
  }
  return PGlite.create({ loadDataDir: template });
}

export async function createUser(db: PGlite, id: string) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id.slice(-4)}@example.test`]);
}

/** Run as a signed-in user (or anon when uid is null), as PostgREST would. */
export async function as<T>(db: PGlite, uid: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    return fn(tx);
  });
}
